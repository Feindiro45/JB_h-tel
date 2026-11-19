<?php

namespace Tests\Feature\Reservations;

use App\Modules\Reservations\Models\Reservation;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class LifecycleTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** @return array<string, mixed> */
    private function occupancyOf(string $roomUuid): array
    {
        foreach ($this->occupancyByRoom() as $row) {
            if (data_get($row, 'room.id') === $roomUuid) {
                return $row;
            }
        }
        $this->fail("Chambre {$roomUuid} absente de l'occupation.");
    }

    /** Recette 2 : réservation immédiate confirmée ; la chambre est occupée pendant le séjour. */
    public function test_check_in_marks_the_room_as_occupied(): void
    {
        $id = $this->bookOk(['start_time' => '10:00', 'end_time' => '20:00', 'billing_unit' => 'HALF_DAY']);
        $this->assertSame('RESERVED', $this->occupancyOf($this->room101->uuid)['state']);

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-in")
            ->assertOk()
            ->assertJsonPath('data.status', 'IN_PROGRESS');

        $row = $this->occupancyOf($this->room101->uuid);
        $this->assertSame('OCCUPIED', $row['state']);
        $this->assertSame('Occupée', $row['state_label']);
        $this->assertSame('2026-12-01T20:00:00+01:00', $row['current']['expected_departure']);
        $this->assertSame('FREE', $this->occupancyOf($this->room102->uuid)['state']);
    }

    public function test_check_in_rules(): void
    {
        $future = $this->bookOk(['start_date' => '2026-12-05', 'end_date' => '2026-12-05']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$future}/check-in")
            ->assertStatus(409)->assertJsonPath('code', 'check_in_too_early');

        $pending = $this->bookOk(['confirm' => false]);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$pending}/check-in")
            ->assertStatus(409)->assertJsonPath('code', 'reservation_not_confirmed');
    }

    /** Recette 4 : clôturer le séjour recalcule l'état en tenant compte des réservations futures. */
    public function test_check_out_frees_the_room_but_keeps_future_reservations(): void
    {
        $today = $this->bookOk(['start_time' => '09:00', 'end_time' => '18:00', 'billing_unit' => 'HALF_DAY']);
        $this->bookOk(['start_date' => '2026-12-03', 'end_date' => '2026-12-03']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$today}/check-in")->assertOk();

        $this->travelTo(now()->addHours(2));
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$today}/check-out")
            ->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.price.net_fcfa', 30000);

        $row = $this->occupancyOf($this->room101->uuid);
        $this->assertSame('FREE', $row['state']);
        $this->assertTrue($row['reserved_later']);
        $this->assertSame('2026-12-03T00:00:00+01:00', $row['next']['blocked_from']);

        // La chambre libérée peut être réservée pour le reste de la journée.
        $this->book(['start_time' => '14:00', 'end_time' => '20:00', 'billing_unit' => 'HALF_DAY'])->assertCreated();
    }

    public function test_cancellation_is_motivated_audited_and_frees_the_room(): void
    {
        $id = $this->bookOk();

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/cancel", [])
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/cancel", ['reason' => 'Client empêché'])
            ->assertOk()
            ->assertJsonPath('data.status', 'CANCELLED')
            ->assertJsonPath('data.cancellation_reason', 'Client empêché');

        $this->assertSame(1, Reservation::query()->count());
        $audit = AuditLog::query()->where('action', 'reservation.cancelled')->firstOrFail();
        $this->assertSame('Client empêché', $audit->after_json['reason'] ?? null);

        $this->book()->assertCreated();
    }

    public function test_reservation_in_progress_cannot_be_cancelled(): void
    {
        $id = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-in")->assertOk();

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/cancel", ['reason' => 'Erreur'])
            ->assertStatus(409)->assertJsonPath('code', 'cannot_cancel_in_progress');
    }

    public function test_occupants_can_be_replaced_within_capacity(): void
    {
        $id = $this->bookOk();

        $this->actingAs($this->cashier)->putJson("/api/v1/reservations/{$id}/occupants", ['occupants' => [['name' => 'Awa'], ['name' => 'Jean', 'is_primary' => true]]])
            ->assertOk()
            ->assertJsonPath('data.occupants.0.name', 'Jean')
            ->assertJsonPath('data.occupants.0.is_primary', true)
            ->assertJsonPath('data.price.net_fcfa', 50000);

        $this->actingAs($this->cashier)->putJson("/api/v1/reservations/{$id}/occupants", ['occupants' => [['name' => 'A'], ['name' => 'B'], ['name' => 'C']]])
            ->assertStatus(422)->assertJsonPath('code', 'capacity_exceeded');

        $this->assertSame(1, AuditLog::query()->where('action', 'reservation.occupants_updated')->count());
    }

    public function test_history_lists_changes_in_french_without_internal_ids(): void
    {
        $id = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/cancel", ['reason' => 'Doublon']);

        $history = $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$id}/history")->assertOk()->json('data');

        $this->assertSame(['Réservation créée', 'Réservation annulée'], array_column($history, 'label'));
        $this->assertSame('Grâce', $history[0]['actor']['name']);
        $this->assertArrayNotHasKey('room_id', $history[1]['after']);
        $this->assertSame('CANCELLED', $history[1]['after']['status']);
    }

    public function test_customer_history_and_reservation_list_filters(): void
    {
        $this->bookOk();
        $this->bookOk(['room_id' => $this->room102->uuid, 'start_date' => '2026-12-04', 'end_date' => '2026-12-05', 'quantity' => 2]);

        $this->actingAs($this->cashier)->getJson("/api/v1/customers/{$this->customer->uuid}/reservations")
            ->assertOk()->assertJsonCount(2, 'data');
        $this->actingAs($this->cashier)->getJson("/api/v1/reservations?room_id={$this->room102->uuid}")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.room.number', '102');
        $this->actingAs($this->cashier)->getJson('/api/v1/reservations?from=2026-12-04&to=2026-12-04')
            ->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->cashier)->getJson('/api/v1/customers/'.Str::uuid7().'/reservations')
            ->assertNotFound();
    }
}
