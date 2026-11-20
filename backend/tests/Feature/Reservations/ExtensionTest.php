<?php

namespace Tests\Feature\Reservations;

use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * Règles validées : un dépassement des 12 h déclenche une alerte et exige la validation explicite
 * de la caissière ; conflits vérifiés et supplément affiché avant toute modification ; auteur,
 * date, ancien et nouveau montant journalisés ; aucune conversion automatique en journée.
 */
class ExtensionTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    private function halfDayInProgress(): string
    {
        $id = $this->bookOk(['billing_unit' => 'HALF_DAY', 'start_time' => '08:00', 'end_time' => '20:00']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-in")->assertOk();

        return $id;
    }

    public function test_extending_a_half_day_beyond_12_hours_needs_more_quantity(): void
    {
        $id = $this->halfDayInProgress();

        $this->actingAs($this->cashier)
            ->postJson("/api/v1/reservations/{$id}/extension/preview", ['end_date' => '2026-12-01', 'end_time' => '23:00', 'additional_quantity' => 0])
            ->assertStatus(422)
            ->assertJsonPath('code', 'half_day_overrun')
            ->assertJsonPath('details.2', 'Quantité nécessaire : 2.');

        $this->actingAs($this->cashier)
            ->postJson("/api/v1/reservations/{$id}/extension/preview", ['end_date' => '2026-12-01', 'end_time' => '23:00', 'additional_quantity' => 1])
            ->assertOk()
            ->assertJsonPath('data.supplement_fcfa', 30000)
            ->assertJsonPath('data.current_price.net_fcfa', 30000)
            ->assertJsonPath('data.proposed_price.net_fcfa', 60000)
            ->assertJsonPath('data.possible', true)
            ->assertJsonPath('data.requires_confirmation', true);
    }

    public function test_extension_requires_explicit_confirmation_and_is_audited(): void
    {
        $id = $this->halfDayInProgress();
        $payload = ['end_date' => '2026-12-01', 'end_time' => '23:00', 'additional_quantity' => 1];

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/extension", $payload)
            ->assertStatus(422)
            ->assertJsonPath('code', 'extension_not_confirmed')
            ->assertJsonPath('message', 'Confirmez explicitement la prolongation et son supplément de 30 000 FCFA.');

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/extension", $payload + ['confirm' => true])
            ->assertOk()
            ->assertJsonPath('data.price.billing_unit', 'HALF_DAY')
            ->assertJsonPath('data.price.quantity', 2)
            ->assertJsonPath('data.price.net_fcfa', 60000)
            ->assertJsonPath('data.period.blocked_until', '2026-12-01T23:00:00+01:00');

        $audit = AuditLog::query()->where('action', 'reservation.extended')->firstOrFail();
        $this->assertSame($this->cashier->id, $audit->actor_id);
        $this->assertSame(30000, $audit->before_json['net_fcfa'] ?? null);
        $this->assertSame(60000, $audit->after_json['net_fcfa'] ?? null);
        $this->assertSame(30000, $audit->after_json['supplement_fcfa'] ?? null);
    }

    public function test_extension_is_refused_when_it_overlaps_the_next_booking(): void
    {
        $id = $this->halfDayInProgress();
        $this->bookOk(['start_date' => '2026-12-02', 'end_date' => '2026-12-02']);

        $this->actingAs($this->cashier)
            // 08:00 → lendemain 10:00 = 26 h, soit 3 demi-journées : la durée est couverte, seul le conflit bloque.
            ->postJson("/api/v1/reservations/{$id}/extension", ['end_date' => '2026-12-02', 'end_time' => '10:00', 'additional_quantity' => 2, 'confirm' => true])
            ->assertStatus(409)
            ->assertJsonPath('code', 'room_unavailable');
    }

    public function test_percent_discount_follows_the_extended_amount(): void
    {
        $id = $this->bookOk(['discount' => ['type' => 'PERCENT', 'value' => 10, 'reason' => 'Fidélité']]);

        $this->actingAs($this->cashier)
            ->postJson("/api/v1/reservations/{$id}/extension", ['end_date' => '2026-12-02', 'additional_quantity' => 1, 'confirm' => true])
            ->assertOk()
            ->assertJsonPath('data.price.gross_fcfa', 100000)
            ->assertJsonPath('data.price.discount_fcfa', 10000)
            ->assertJsonPath('data.price.net_fcfa', 90000)
            ->assertJsonPath('data.period.end_date', '2026-12-02');
    }

    public function test_finished_stay_or_earlier_end_cannot_be_extended(): void
    {
        $id = $this->bookOk(['start_date' => '2026-12-02', 'end_date' => '2026-12-03', 'quantity' => 1]);

        $this->actingAs($this->cashier)
            ->postJson("/api/v1/reservations/{$id}/extension/preview", ['end_date' => '2026-12-02', 'additional_quantity' => 0])
            ->assertStatus(422)->assertJsonPath('code', 'extension_not_later');

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/cancel", ['reason' => 'Annulé']);
        $this->actingAs($this->cashier)
            ->postJson("/api/v1/reservations/{$id}/extension/preview", ['end_date' => '2026-12-05', 'additional_quantity' => 2])
            ->assertStatus(409)->assertJsonPath('code', 'invalid_reservation_status');
    }
}
