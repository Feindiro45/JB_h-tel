<?php

namespace Tests\Concerns;

use App\Modules\Customers\Models\Customer;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use Carbon\CarbonImmutable;
use Database\Seeders\RolesAndPermissionsSeeder;
use Database\Seeders\RoomTypesSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * Petit hôtel de test, au 01/12/2026 10:00 (heure de Bangui) :
 * - chambre 101 VIP (2 places) et 102 Standard (2 places) ;
 * - tarifs VIP 50 000 (journée) et 30 000 (demi-journée), Standard 30 000 et 20 000 ;
 * - une caissière, un administrateur, une cliente.
 */
trait BuildsHotel
{
    protected User $admin;

    protected User $cashier;

    protected Room $room101;

    protected Room $room102;

    protected RoomType $vip;

    protected RoomType $standard;

    protected Customer $customer;

    protected function buildHotel(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-12-01 10:00', 'Africa/Bangui'));
        $this->seed([RolesAndPermissionsSeeder::class, SettingsSeeder::class, RoomTypesSeeder::class]);

        $this->vip = RoomType::query()->where('code', 'VIP')->firstOrFail();
        $this->standard = RoomType::query()->where('code', 'STANDARD')->firstOrFail();
        $this->room101 = Room::factory()->create(['number' => '101', 'room_type_id' => $this->vip->id, 'capacity' => 2]);
        $this->room102 = Room::factory()->create(['number' => '102', 'room_type_id' => $this->standard->id, 'capacity' => 2]);

        foreach ([[$this->vip, BillingUnit::Day, 50000], [$this->vip, BillingUnit::HalfDay, 30000],
            [$this->standard, BillingUnit::Day, 30000], [$this->standard, BillingUnit::HalfDay, 20000]] as [$type, $unit, $amount]) {
            RoomRate::factory()->create([
                'room_type_id' => $type->id, 'billing_unit' => $unit, 'amount_fcfa' => $amount,
                'effective_from' => now()->subMonth(),
            ]);
        }

        $this->admin = User::factory()->admin()->create(['name' => 'Directeur']);
        $this->cashier = User::factory()->cashier()->create(['name' => 'Grâce']);
        $this->customer = Customer::factory()->create(['name' => 'NGAÏKOSSET', 'first_name' => 'Awa', 'phone' => '+236 72 00 00 00']);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    protected function payload(array $overrides = []): array
    {
        return array_merge([
            'room_id' => $this->room101->uuid,
            'customer_id' => $this->customer->uuid,
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-01',
            'billing_unit' => 'DAY',
            'quantity' => 1,
            'occupants' => [['name' => 'Awa Ngaïkosset', 'is_primary' => true]],
        ], $overrides);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return TestResponse<Response>
     */
    protected function book(array $overrides = [], ?User $as = null): TestResponse
    {
        return $this->actingAs($as ?? $this->cashier)->postJson('/api/v1/reservations', $this->payload($overrides));
    }

    /** @param  array<string, mixed>  $overrides */
    protected function bookOk(array $overrides = [], ?User $as = null): string
    {
        return (string) $this->book($overrides, $as)->assertCreated()->json('data.id');
    }

    /**
     * Fixture d'un séjour confirmé avant D-068, sans document automatique.
     *
     * @param  array<string, mixed>  $overrides
     */
    protected function bookLegacyUninvoiced(array $overrides = [], ?User $as = null): string
    {
        $id = $this->bookOk([...$overrides, 'confirm' => false], $as);
        Reservation::query()->where('uuid', $id)->update(['status' => 'CONFIRMED']);

        return $id;
    }

    /**
     * Occupation à un instant, indexée par numéro de chambre.
     *
     * @return array<string, array<string, mixed>>
     */
    protected function occupancyByRoom(?string $at = null): array
    {
        /** @var list<array<string, mixed>> $rows */
        $rows = (array) $this->actingAs($this->cashier)
            ->getJson('/api/v1/occupancy'.($at === null ? '' : '?at='.urlencode($at)))
            ->assertOk()
            ->json('data');

        $byNumber = [];
        foreach ($rows as $row) {
            $byNumber[(string) data_get($row, 'room.number')] = $row;
        }

        return $byNumber;
    }
}
