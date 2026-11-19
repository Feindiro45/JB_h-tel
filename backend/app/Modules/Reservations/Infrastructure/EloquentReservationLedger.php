<?php

namespace App\Modules\Reservations\Infrastructure;

use App\Modules\Reservations\Contracts\ReservationDue;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\Models\Reservation;
use Illuminate\Support\Str;

final class EloquentReservationLedger implements ReservationLedger
{
    public function find(int $reservationId): ?ReservationDue
    {
        $reservation = Reservation::query()->find($reservationId);

        return $reservation === null ? null : self::toDue($reservation);
    }

    public function findByUuid(string $uuid): ?ReservationDue
    {
        if (! Str::isUuid($uuid)) {
            return null;
        }
        $reservation = Reservation::query()->where('uuid', $uuid)->first();

        return $reservation === null ? null : self::toDue($reservation);
    }

    public function lockForPayment(int $reservationId): ?ReservationDue
    {
        $reservation = Reservation::query()->lockForUpdate()->find($reservationId);

        return $reservation === null ? null : self::toDue($reservation);
    }

    private static function toDue(Reservation $reservation): ReservationDue
    {
        return new ReservationDue(
            id: $reservation->id,
            uuid: $reservation->uuid,
            netFcfa: $reservation->net_fcfa,
            status: $reservation->status->value,
            statusLabel: $reservation->status->label(),
            cancelled: $reservation->status === ReservationStatus::Cancelled,
            customerId: $reservation->customer_id,
            roomId: $reservation->room_id,
        );
    }
}
