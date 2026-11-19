<?php

namespace App\Modules\RoomCatalog\Infrastructure;

use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Modules\RoomCatalog\Contracts\RoomSnapshot;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Support\Str;

final class EloquentRoomDirectory implements RoomDirectory
{
    public function find(int $roomId): ?RoomSnapshot
    {
        $room = Room::query()->with('roomType')->find($roomId);

        return $room === null ? null : $this->toSnapshot($room);
    }

    public function findByUuid(string $uuid): ?RoomSnapshot
    {
        if (! Str::isUuid($uuid)) {
            return null;
        }
        $room = Room::query()->with('roomType')->where('uuid', $uuid)->first();

        return $room === null ? null : $this->toSnapshot($room);
    }

    public function all(): array
    {
        return Room::query()->with('roomType')->orderByNumber()->get()
            ->map(fn (Room $room) => $this->toSnapshot($room))
            ->values()
            ->all();
    }

    public function roomTypeIdByUuid(string $uuid): ?int
    {
        if (! Str::isUuid($uuid)) {
            return null;
        }
        $id = RoomType::query()->where('uuid', $uuid)->value('id');

        return is_numeric($id) ? (int) $id : null;
    }

    public function lockForReservation(int $roomId): ?RoomSnapshot
    {
        $room = Room::query()->with('roomType')->lockForUpdate()->find($roomId);

        return $room === null ? null : $this->toSnapshot($room);
    }

    private function toSnapshot(Room $room): RoomSnapshot
    {
        return new RoomSnapshot(
            id: $room->id,
            uuid: $room->uuid,
            number: $room->number,
            roomTypeId: $room->room_type_id,
            roomTypeCode: $room->roomType->code,
            roomTypeLabel: $room->roomType->label,
            capacity: $room->capacity,
            underMaintenance: $room->isUnderMaintenance(),
        );
    }
}
