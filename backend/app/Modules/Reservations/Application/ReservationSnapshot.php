<?php

namespace App\Modules\Reservations\Application;

use App\Modules\Reservations\Models\Reservation;

/** État d'une réservation pour le journal d'audit (avant et après chaque opération). */
final class ReservationSnapshot
{
    /** @return array<string, mixed> */
    public static function of(Reservation $reservation): array
    {
        return [
            'status' => $reservation->status->value,
            'room_id' => $reservation->room_id,
            'customer_id' => $reservation->customer_id,
            'start_date' => $reservation->start_date->toDateString(),
            'end_date' => $reservation->end_date->toDateString(),
            'start_time' => $reservation->start_time,
            'end_time' => $reservation->end_time,
            'blocked_from' => $reservation->blocked_from->toDateTimeString(),
            'blocked_until' => $reservation->blocked_until->toDateTimeString(),
            'billing_unit' => $reservation->billing_unit->value,
            'quantity' => $reservation->quantity,
            'rate_id' => $reservation->rate_id,
            'applied_unit_price_fcfa' => $reservation->applied_unit_price_fcfa,
            'gross_fcfa' => $reservation->gross_fcfa,
            'discount_type' => $reservation->discount_type?->value,
            'discount_value' => $reservation->discount_value,
            'discount_fcfa' => $reservation->discount_fcfa,
            'discount_reason' => $reservation->discount_reason,
            'net_fcfa' => $reservation->net_fcfa,
        ];
    }
}
