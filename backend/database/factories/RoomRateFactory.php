<?php

namespace Database\Factories;

use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<RoomRate> */
class RoomRateFactory extends Factory
{
    protected $model = RoomRate::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'room_type_id' => RoomType::factory(),
            'billing_unit' => BillingUnit::Day,
            'amount_fcfa' => 50000,
            'effective_from' => now()->subMonth()->startOfDay(),
            'effective_to' => null,
            'reason' => 'Tarif initial',
        ];
    }
}
