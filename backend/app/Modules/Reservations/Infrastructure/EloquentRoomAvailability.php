<?php

namespace App\Modules\Reservations\Infrastructure;

use App\Modules\Reservations\Domain\Contracts\RoomAvailability;
use App\Modules\Reservations\Models\Reservation;
use Carbon\CarbonImmutable;

final class EloquentRoomAvailability implements RoomAvailability
{
    public function conflicts(int $roomId, CarbonImmutable $from, CarbonImmutable $until, ?int $exceptReservationId = null): array
    {
        return Reservation::query()
            ->blocking($roomId, $from, $until)
            ->when($exceptReservationId !== null, fn ($query) => $query->whereKeyNot($exceptReservationId))
            ->orderBy('blocked_from')
            ->get()
            ->all();
    }
}
