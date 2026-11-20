<?php

namespace Tests\Feature\Reservations;

use App\Modules\Reservations\Models\Reservation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class CalendarDayQuantityTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** @return array<string, array{string, string, int}> */
    public static function stays(): array
    {
        return [
            'même jour, minimum un' => ['2026-12-01', '2026-12-01', 1],
            'trois jours' => ['2026-12-01', '2026-12-04', 3],
            'changement année' => ['2026-12-31', '2027-01-02', 2],
            'année bissextile' => ['2028-02-28', '2028-03-01', 2],
        ];
    }

    #[DataProvider('stays')]
    public function test_quote_and_creation_use_calendar_days(string $start, string $end, int $quantity): void
    {
        $payload = $this->payload(['start_date' => $start, 'end_date' => $end, 'quantity' => $quantity]);
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations/quote', $payload)
            ->assertOk()->assertJsonPath('data.price.quantity', $quantity)
            ->assertJsonPath('data.price.net_fcfa', 50000 * $quantity);
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations', $payload)
            ->assertCreated()->assertJsonPath('data.price.quantity', $quantity)
            ->assertJsonPath('data.price.net_fcfa', 50000 * $quantity);
    }

    public function test_quote_and_creation_reject_a_tampered_quantity(): void
    {
        $payload = $this->payload(['end_date' => '2026-12-04', 'quantity' => 4]);
        foreach (['/api/v1/reservations/quote', '/api/v1/reservations'] as $url) {
            $this->actingAs($this->cashier)->postJson($url, $payload)
                ->assertUnprocessable()->assertJsonValidationErrors('quantity');
        }
        $this->assertDatabaseCount('reservations', 0);
    }

    public function test_hours_do_not_change_the_calendar_day_count(): void
    {
        $this->book(['end_date' => '2026-12-02', 'start_time' => '22:00', 'end_time' => '03:00'])
            ->assertCreated()->assertJsonPath('data.price.quantity', 1)
            ->assertJsonPath('data.period.blocked_until', '2026-12-02T03:00:00+01:00');
    }

    public function test_day_extension_checks_the_added_days_before_preview_and_commit(): void
    {
        $id = $this->bookOk(['end_date' => '2026-12-02']);
        $payload = ['end_date' => '2026-12-04', 'additional_quantity' => 1, 'confirm' => true];
        foreach (['/extension/preview', '/extension'] as $suffix) {
            $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}{$suffix}", $payload)
                ->assertUnprocessable()->assertJsonPath('code', 'day_quantity_mismatch');
        }
        $this->assertDatabaseCount('reservation_extensions', 0);
        $payload['additional_quantity'] = 2;
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/extension/preview", $payload)
            ->assertOk()->assertJsonPath('data.supplement_fcfa', 100000)
            ->assertJsonPath('data.proposed_price.quantity', 3);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/extension", $payload)
            ->assertOk()->assertJsonPath('data.price.quantity', 3)
            ->assertJsonPath('data.price.net_fcfa', 150000);
    }

    public function test_extension_keeps_the_quantity_of_a_legacy_stay(): void
    {
        $id = $this->bookOk(['end_date' => '2026-12-02']);
        // Ancien séjour saisi manuellement : son prix figé ne doit pas être recalculé.
        Reservation::query()->where('uuid', $id)->firstOrFail()
            ->forceFill(['quantity' => 5, 'gross_fcfa' => 250000, 'net_fcfa' => 250000])->save();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/extension/preview", [
            'end_date' => '2026-12-04', 'additional_quantity' => 2,
        ])->assertOk()->assertJsonPath('data.current_price.quantity', 5)
            ->assertJsonPath('data.proposed_price.quantity', 7)
            ->assertJsonPath('data.supplement_fcfa', 100000);
    }
}
