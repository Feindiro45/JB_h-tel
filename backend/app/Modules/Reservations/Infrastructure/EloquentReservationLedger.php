<?php

namespace App\Modules\Reservations\Infrastructure;

use App\Modules\Reservations\Contracts\ReservationDue;
use App\Modules\Reservations\Contracts\ReservationInvoiceData;
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

    public function findMany(array $reservationIds): array
    {
        if ($reservationIds === []) {
            return [];
        }

        return Reservation::query()->whereIn('id', array_values(array_unique($reservationIds)))->get()
            ->mapWithKeys(fn (Reservation $reservation) => [$reservation->id => self::toDue($reservation)])
            ->all();
    }

    public function lockForPayment(int $reservationId): ?ReservationDue
    {
        $reservation = Reservation::query()->lockForUpdate()->find($reservationId);

        return $reservation === null ? null : self::toDue($reservation);
    }

    public function invoiceData(int $reservationId): ?ReservationInvoiceData
    {
        $reservation = Reservation::query()->find($reservationId);
        if ($reservation === null) {
            return null;
        }
        $discount = $reservation->discount();

        return new ReservationInvoiceData(
            id: $reservation->id,
            uuid: $reservation->uuid,
            status: $reservation->status->value,
            statusLabel: $reservation->status->label(),
            customerId: $reservation->customer_id,
            roomId: $reservation->room_id,
            startDate: $reservation->start_date->toDateString(),
            endDate: $reservation->end_date->toDateString(),
            startTime: $reservation->start_time === null ? null : substr($reservation->start_time, 0, 5),
            endTime: $reservation->end_time === null ? null : substr($reservation->end_time, 0, 5),
            blockedFrom: $reservation->blocked_from->toIso8601String(),
            blockedUntil: $reservation->blocked_until->toIso8601String(),
            periodIsEstimated: $reservation->period_is_estimated,
            billingUnit: $reservation->billing_unit->value,
            billingUnitLabel: $reservation->billing_unit->label(),
            quantity: $reservation->quantity,
            unitPriceFcfa: $reservation->applied_unit_price_fcfa,
            grossFcfa: $reservation->gross_fcfa,
            discountLabel: $discount?->describe(),
            discountReason: $discount?->reason,
            discountFcfa: $reservation->discount_fcfa,
            netFcfa: $reservation->net_fcfa,
        );
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
