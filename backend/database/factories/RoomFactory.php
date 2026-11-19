<?php

namespace Database\Factories;

use App\Modules\RoomCatalog\Domain\MaintenanceStatus;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Room> */
class RoomFactory extends Factory
{
    protected $model = Room::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'number' => fake()->unique()->numerify('###'),
            'room_type_id' => RoomType::factory(),
            'capacity' => 2,
            'maintenance_status' => MaintenanceStatus::Available,
        ];
    }

    public function underMaintenance(string $note = 'Climatisation en panne'): static
    {
        return $this->state(fn () => ['maintenance_status' => MaintenanceStatus::Maintenance, 'maintenance_note' => $note]);
    }
}
