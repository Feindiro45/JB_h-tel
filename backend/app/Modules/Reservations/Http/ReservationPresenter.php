<?php

namespace App\Modules\Reservations\Http;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Customers\Contracts\CustomerSnapshot;
use App\Modules\Reservations\Application\ExtensionPreview;
use App\Modules\Reservations\Application\ReservationQuote;
use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Domain\PriceBreakdown;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Modules\RoomCatalog\Contracts\RoomSnapshot;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;

/**
 * Représentation JSON des réservations. Les chambres et les clients sont lus par les contrats
 * publics des autres modules, en une requête par lot. Identifiants exposés : UUID seulement (D-026).
 */
final class ReservationPresenter
{
    public function __construct(
        private readonly RoomDirectory $rooms,
        private readonly CustomerDirectory $customers,
    ) {}

    /**
     * @param  iterable<Reservation>  $reservations
     * @return list<array<string, mixed>>
     */
    public function many(iterable $reservations): array
    {
        $list = is_array($reservations) ? $reservations : iterator_to_array($reservations, false);
        // D-072 : informations des salles de conférence, en une requête pour toute la liste.
        (new EloquentCollection($list))->loadMissing('event');
        $customers = $this->customers->findMany(array_values(array_unique(array_map(fn (Reservation $r) => $r->customer_id, $list))));
        $rooms = [];
        foreach ($list as $reservation) {
            $rooms[$reservation->room_id] ??= $this->rooms->find($reservation->room_id);
        }

        return array_map(fn (Reservation $r) => $this->toArray($r, $rooms[$r->room_id] ?? null, $customers[$r->customer_id] ?? null), $list);
    }

    /** @return array<string, mixed> */
    public function one(Reservation $reservation): array
    {
        return $this->many([$reservation->loadMissing('occupants')])[0];
    }

    /** @return array<string, mixed> */
    public function toArray(Reservation $reservation, ?RoomSnapshot $room, ?CustomerSnapshot $customer): array
    {
        return [
            'id' => $reservation->uuid,
            'status' => $reservation->status->value,
            'status_label' => $reservation->status->label(),
            'departure_overdue' => $reservation->status === ReservationStatus::InProgress && $reservation->blocked_until->lte(now()),
            'room' => $room === null ? null : self::room($room),
            'customer' => $customer === null ? null : [
                'id' => $customer->uuid,
                'full_name' => $customer->fullName,
                'phone' => $customer->phone,
            ],
            'period' => [
                'start_date' => $reservation->start_date->toDateString(),
                'end_date' => $reservation->end_date->toDateString(),
                'start_time' => $reservation->start_time === null ? null : substr($reservation->start_time, 0, 5),
                'end_time' => $reservation->end_time === null ? null : substr($reservation->end_time, 0, 5),
            ] + self::blocked($reservation->blockedPeriod()),
            'price' => [
                'billing_unit' => $reservation->billing_unit->value,
                'billing_unit_label' => $reservation->billing_unit->label(),
            ] + self::price(new PriceBreakdown(
                $reservation->applied_unit_price_fcfa,
                $reservation->quantity,
                $reservation->gross_fcfa,
                $reservation->discount(),
                $reservation->discount_fcfa,
                $reservation->net_fcfa,
            )) + [
                // Une réservation annulée ne doit plus rien (D-035, D-053) : le prix reste affiché pour mémoire.
                'amount_due_fcfa' => $reservation->status === ReservationStatus::Cancelled ? 0 : $reservation->net_fcfa,
            ],
            'occupants' => $reservation->relationLoaded('occupants')
                ? $reservation->occupants->map(fn ($o) => ['id' => $o->uuid, 'name' => $o->name, 'is_primary' => $o->is_primary])->values()->all()
                : null,
            'event' => $reservation->relationLoaded('event') ? $reservation->event?->toPublicArray() : null,
            'notes' => $reservation->notes,
            'checked_in_at' => $reservation->checked_in_at?->toIso8601String(),
            'checked_out_at' => $reservation->checked_out_at?->toIso8601String(),
            'cancelled_at' => $reservation->cancelled_at?->toIso8601String(),
            'cancellation_reason' => $reservation->cancellation_reason,
            'created_at' => $reservation->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    public static function quote(ReservationQuote $quote): array
    {
        return [
            'room' => self::room($quote->room),
            'period' => self::blocked($quote->period),
            'price' => [
                'billing_unit' => $quote->billingUnit->value,
                'billing_unit_label' => $quote->billingUnit->label(),
                'rate_effective_from' => $quote->rate->effectiveFrom->toIso8601String(),
            ] + self::price($quote->price),
            'available' => $quote->isAvailable(),
            'conflicts' => array_map(fn (Reservation $c) => self::brief($c), $quote->conflicts),
        ];
    }

    /** @return array<string, mixed> */
    public static function extension(ExtensionPreview $preview): array
    {
        return [
            'current_period' => self::blocked($preview->currentPeriod),
            'new_period' => self::blocked($preview->newPeriod),
            'current_price' => self::price($preview->currentPrice),
            'proposed_price' => self::price($preview->proposedPrice),
            'supplement_fcfa' => $preview->supplementFcfa(),
            'possible' => $preview->isPossible(),
            'conflicts' => array_map(fn (Reservation $c) => self::brief($c), $preview->conflicts),
            'requires_confirmation' => true,
        ];
    }

    /** @return array<string, mixed> Résumé d'une réservation (conflits, occupation). */
    public static function brief(Reservation $reservation): array
    {
        return [
            'id' => $reservation->uuid,
            'status' => $reservation->status->value,
            'status_label' => $reservation->status->label(),
        ] + self::blocked($reservation->blockedPeriod());
    }

    /** @return array<string, mixed> */
    public static function room(RoomSnapshot $room): array
    {
        return [
            'id' => $room->uuid,
            'number' => $room->number,
            'room_type' => ['code' => $room->roomTypeCode, 'label' => $room->roomTypeLabel, 'kind' => $room->kind->value],
            'capacity' => $room->capacity,
            'under_maintenance' => $room->underMaintenance,
        ];
    }

    /** @return array<string, mixed> */
    private static function blocked(BlockedPeriod $period): array
    {
        return [
            'blocked_from' => $period->from->toIso8601String(),
            'blocked_until' => $period->until->toIso8601String(),
            'is_estimated' => $period->estimated,
        ];
    }

    /** @return array<string, mixed> */
    private static function price(PriceBreakdown $price): array
    {
        return [
            'unit_price_fcfa' => $price->unitPriceFcfa,
            'quantity' => $price->quantity,
            'gross_fcfa' => $price->grossFcfa,
            'discount' => $price->discount === null ? null : [
                'type' => $price->discount->type->value,
                'type_label' => $price->discount->type->label(),
                'value' => $price->discount->describe(),
                'reason' => $price->discount->reason,
            ],
            'discount_fcfa' => $price->discountFcfa,
            'net_fcfa' => $price->netFcfa,
        ];
    }
}
