<?php

namespace Tests\Feature\Reservations;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/** États calculés par période (fiche 06) : jamais un booléen « occupée » modifié à la main. */
class AvailabilityTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, string>
     */
    private function states(array $query): array
    {
        /** @var list<array<string, mixed>> $rows */
        $rows = (array) $this->actingAs($this->cashier)->getJson('/api/v1/availability?'.http_build_query($query))->assertOk()->json('data');

        $states = [];
        foreach ($rows as $row) {
            $states[(string) data_get($row, 'room.number')] = (string) data_get($row, 'state');
        }

        return $states;
    }

    public function test_period_states_are_computed_from_reservations_and_maintenance(): void
    {
        $this->bookOk(['start_date' => '2026-12-02', 'end_date' => '2026-12-03', 'quantity' => 1]);

        $this->assertSame(['101' => 'RESERVED', '102' => 'FREE'], $this->states(['start_date' => '2026-12-03', 'end_date' => '2026-12-03']));
        $this->assertSame(['101' => 'FREE', '102' => 'FREE'], $this->states(['start_date' => '2026-12-04', 'end_date' => '2026-12-04']));

        $this->room102->forceFill(['maintenance_status' => 'MAINTENANCE'])->save();
        $this->assertSame(['101' => 'FREE', '102' => 'MAINTENANCE'], $this->states(['start_date' => '2026-12-04', 'end_date' => '2026-12-04']));
    }

    public function test_only_free_rooms_matching_filters_are_proposed(): void
    {
        $this->bookOk();

        $this->assertSame(['102' => 'FREE'], $this->states(['start_date' => '2026-12-01', 'end_date' => '2026-12-01', 'only_free' => 1]));
        $this->assertSame([], $this->states(['start_date' => '2026-12-01', 'end_date' => '2026-12-01', 'only_free' => 1, 'room_type_id' => $this->vip->uuid]));
        $this->assertSame([], $this->states(['start_date' => '2026-12-02', 'end_date' => '2026-12-02', 'min_capacity' => 3]));
    }

    public function test_hours_narrow_the_checked_period(): void
    {
        $this->bookOk(['billing_unit' => 'HALF_DAY', 'start_time' => '08:00', 'end_time' => '12:00']);

        $this->assertSame('FREE', data_get($this->states(['start_date' => '2026-12-01', 'end_date' => '2026-12-01', 'start_time' => '13:00', 'end_time' => '18:00']), '101'));
        $this->assertSame('RESERVED', data_get($this->states(['start_date' => '2026-12-01', 'end_date' => '2026-12-01']), '101'));
    }

    public function test_availability_parameters_are_validated(): void
    {
        $this->actingAs($this->cashier)->getJson('/api/v1/availability?start_date=2026-12-03&end_date=2026-12-02')
            ->assertStatus(422)->assertJsonValidationErrors(['end_date']);
        $this->actingAs($this->cashier)->getJson('/api/v1/availability')
            ->assertStatus(422)->assertJsonPath('title', 'Données invalides');
    }

    public function test_occupancy_shows_reserved_later_and_maintenance(): void
    {
        $this->bookOk(['start_date' => '2026-12-04', 'end_date' => '2026-12-04']);
        $this->room102->forceFill(['maintenance_status' => 'MAINTENANCE'])->save();

        $rows = $this->occupancyByRoom();

        $this->assertSame('FREE', data_get($rows, '101.state'));
        $this->assertTrue(data_get($rows, '101.reserved_later'));
        $this->assertSame('MAINTENANCE', data_get($rows, '102.state'));
        $this->assertFalse(data_get($rows, '102.reserved_later'));

        $later = $this->occupancyByRoom('2026-12-04T12:00:00');
        $this->assertSame('RESERVED', data_get($later, '101.state'));
    }
}
