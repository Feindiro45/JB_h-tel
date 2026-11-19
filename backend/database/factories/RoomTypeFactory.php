<?php

namespace Database\Factories;

use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<RoomType> */
class RoomTypeFactory extends Factory
{
    protected $model = RoomType::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $code = strtoupper(fake()->unique()->lexify('TYPE_????'));

        return ['code' => $code, 'label' => ucfirst(strtolower($code)), 'description' => null];
    }

    public function vip(): static
    {
        return $this->state(fn () => ['code' => 'VIP', 'label' => 'VIP']);
    }

    public function standard(): static
    {
        return $this->state(fn () => ['code' => 'STANDARD', 'label' => 'Standard']);
    }
}
