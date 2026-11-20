<?php

namespace App\Modules\Reservations\Infrastructure;

use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomUsage;

/** Une chambre référencée par une réservation, même annulée ou terminée, ne se supprime pas (D-058). */
final class RoomReservationUsage implements RoomUsage
{
    public function isUsed(int $roomId): bool
    {
        return Reservation::query()->where('room_id', $roomId)->exists();
    }
}
