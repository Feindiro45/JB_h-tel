<?php

namespace App\Modules\Reservations\Infrastructure;

use App\Modules\Customers\Contracts\CustomerUsage;
use App\Modules\Reservations\Models\Reservation;

/** Un client référencé par une réservation, même annulée, ne se supprime pas (D-058). */
final class CustomerReservationUsage implements CustomerUsage
{
    public function isUsed(int $customerId): bool
    {
        return Reservation::query()->where('customer_id', $customerId)->exists();
    }
}
