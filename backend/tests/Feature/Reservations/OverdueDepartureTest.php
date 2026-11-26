<?php

namespace Tests\Feature\Reservations;

use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\Models\Reservation;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class OverdueDepartureTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    private function checkedIn(): string
    {
        $id = $this->bookOk(['start_time' => '08:00', 'end_time' => '12:00', 'billing_unit' => 'HALF_DAY']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-in")->assertOk();

        return $id;
    }

    private function at(string $date): void
    {
        $this->travelTo(CarbonImmutable::parse($date, 'Africa/Bangui'));
    }

    public function test_overdue_stay_blocks_planning_availability_and_new_bookings_until_checkout(): void
    {
        $id = $this->checkedIn();
        $this->at('2026-12-01 13:30');
        $query = '?start_date=2026-12-01&end_date=2026-12-01&start_time=13:00&end_time=18:00';
        $this->actingAs($this->cashier)->getJson('/api/v1/availability'.$query)
            ->assertOk()->assertJsonPath('data.0.state', 'OCCUPIED');
        $this->actingAs($this->cashier)->getJson('/api/v1/availability'.$query.'&only_free=1')
            ->assertOk()->assertJsonMissing(['number' => '101']);
        $this->actingAs($this->cashier)->getJson('/api/v1/planning?from=2026-12-02&days=2')
            ->assertOk()->assertJsonPath('data.0.days.2026-12-02', 'OCCUPIED')
            ->assertJsonPath('data.0.days.2026-12-03', 'OCCUPIED');
        $this->assertSame('OCCUPIED', data_get($this->occupancyByRoom(), '101.state'));
        $this->book(['start_date' => '2026-12-02', 'end_date' => '2026-12-02'])
            ->assertConflict()->assertJsonPath('code', 'room_unavailable');
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations/quote', $this->payload(['end_date' => '2026-12-02']))
            ->assertOk()->assertJsonPath('data.available', false);
        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$id}")
            ->assertOk()->assertJsonPath('data.status', 'IN_PROGRESS')
            ->assertJsonPath('data.departure_overdue', true)->assertJsonPath('data.price.net_fcfa', 30000);

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-out", ['unpaid_reason' => 'Paiement prévu plus tard'])->assertOk();
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts/summary')->assertJsonPath('data.total', 0);
        $this->actingAs($this->cashier)->getJson('/api/v1/availability'.$query)
            ->assertOk()->assertJsonPath('data.0.state', 'FREE');
        $this->book(['start_date' => '2026-12-02', 'end_date' => '2026-12-02'])->assertCreated();
    }

    public function test_alert_starts_at_the_exact_expected_departure_and_disappears_after_extension(): void
    {
        $id = $this->checkedIn();
        $this->at('2026-12-01 11:59:59');
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->cashier)->getJson('/api/v1/availability?start_date=2026-12-02&end_date=2026-12-02')
            ->assertOk()->assertJsonPath('data.0.state', 'FREE');
        $this->at('2026-12-01 12:00:00');
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts')
            ->assertOk()->assertJsonPath('data.0.id', $id)->assertJsonPath('data.0.overdue_minutes', 0);
        $this->at('2026-12-01 13:30');
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts')->assertJsonPath('data.0.overdue_minutes', 90);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/extension", [
            'end_date' => '2026-12-01', 'end_time' => '18:00', 'additional_quantity' => 0, 'confirm' => true,
        ])->assertOk()->assertJsonPath('data.departure_overdue', false);
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts/summary')->assertJsonPath('data.total', 0);
        $this->actingAs($this->cashier)->getJson('/api/v1/planning?from=2026-12-02&days=1')
            ->assertOk()->assertJsonPath('data.0.days.2026-12-02', 'FREE');
    }

    public function test_missing_departure_time_uses_the_end_of_day_and_ignores_stays_without_checkin(): void
    {
        $id = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-in")->assertOk();
        $this->bookOk(['room_id' => $this->room102->uuid, 'confirm' => false]);
        $this->at('2026-12-01 23:59:59');
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts/summary')->assertJsonPath('data.total', 0);
        $this->at('2026-12-02 00:00:00');
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts/summary')
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.day', 1)->assertJsonPath('data.half_day', 0);
        $this->actingAs($this->cashier)->getJson('/api/v1/availability?start_date=2026-12-02&end_date=2026-12-02')
            ->assertOk()->assertJsonPath('data.0.state', 'OCCUPIED')->assertJsonPath('data.1.state', 'FREE');
    }

    public function test_existing_next_booking_cannot_check_in_or_be_overlapped_by_a_late_extension(): void
    {
        $id = $this->checkedIn();
        $next = $this->bookOk(['start_date' => '2026-12-02', 'end_date' => '2026-12-02']);
        $this->at('2026-12-02 10:00');
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$next}/check-in")
            ->assertConflict()->assertJsonPath('code', 'room_still_occupied');
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/extension", [
            'end_date' => '2026-12-02', 'end_time' => '12:00', 'additional_quantity' => 2, 'confirm' => true,
        ])->assertConflict()->assertJsonPath('code', 'room_unavailable');
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-out", ['unpaid_reason' => 'Paiement prévu plus tard'])->assertOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$next}/check-in")->assertOk();
    }

    public function test_alerts_are_paginated_searchable_sorted_and_expose_only_public_ids(): void
    {
        $from = CarbonImmutable::parse('2026-11-30 08:00', 'Africa/Bangui');
        foreach (range(1, 12) as $i) {
            Reservation::factory()->between($from, $from->addHours($i))->status(ReservationStatus::InProgress)->create([
                'room_id' => $i === 12 ? $this->room102->id : $this->room101->id,
                'customer_id' => $this->customer->id, 'created_by' => $this->cashier->id,
                'billing_unit' => $i === 12 ? 'HALF_DAY' : 'DAY',
            ]);
        }
        $response = $this->actingAs($this->cashier)->getJson('/api/v1/alerts?per_page=10&page=2')->assertOk()
            ->assertJsonPath('meta.total', 12)->assertJsonCount(2, 'data');
        $this->assertStringNotContainsString('"room_id"', $response->getContent());
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $response->json('data.0.id'));
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts?search=102')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.room.number', '102');
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts?search=NGA')->assertJsonPath('meta.total', 12);
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts?billing_unit=HALF_DAY')->assertJsonPath('meta.total', 1);
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts?search=introuvable')->assertJsonCount(0, 'data');
        $this->room101->forceFill(['number' => 'VIP-A'])->save();
        $this->room102->forceFill(['number' => 'VIP-B'])->save();
        $this->customer->forceFill(['phone' => '+23675112233'])->save();
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts?search=0')->assertJsonCount(0, 'data');
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts/summary')
            ->assertJsonPath('data.total', 12)->assertJsonPath('data.rooms', 2)->assertJsonPath('data.day', 11)->assertJsonPath('data.half_day', 1);
    }

    public function test_alert_permissions_and_filter_validation(): void
    {
        $this->getJson('/api/v1/alerts')->assertUnauthorized();
        $this->getJson('/api/v1/alerts/summary')->assertUnauthorized();
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts?billing_unit=INVALID&page=0')->assertUnprocessable();
        Role::findByName('caissiere', 'web')->revokePermissionTo('reservations.view');
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts')->assertForbidden();
        $this->actingAs($this->cashier)->getJson('/api/v1/alerts/summary')->assertForbidden();
    }
}
