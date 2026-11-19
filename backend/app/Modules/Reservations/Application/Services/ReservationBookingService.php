<?php

namespace App\Modules\Reservations\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\ReservationQuote;
use App\Modules\Reservations\Application\ReservationSnapshot;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\DTO\OccupantData;
use App\Modules\Reservations\DTO\ReservationRequestData;
use App\Modules\Reservations\Events\ReservationConfirmed;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Modules\RoomCatalog\Contracts\RoomSnapshot;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Support\Facades\DB;

/**
 * Création et confirmation des réservations.
 *
 * Anti double réservation (invariant 1 du document 02) : dans une même transaction, la ligne de
 * la chambre est verrouillée (`SELECT … FOR UPDATE`), puis la maintenance et les conflits sont
 * revalidés avant l'insertion. Deux caissières qui confirment la même chambre au même moment
 * sont donc traitées l'une après l'autre ; la seconde voit la réservation de la première.
 */
final class ReservationBookingService
{
    public function __construct(
        private readonly RoomDirectory $rooms,
        private readonly ReservationQuoter $quoter,
        private readonly AuditTrail $audit,
    ) {}

    public function create(ReservationRequestData $data, User $actor): Reservation
    {
        return DB::transaction(function () use ($data, $actor): Reservation {
            $room = $this->rooms->lockForReservation($data->roomId) ?? throw ReservationQuoter::roomNotFound();
            $quote = $this->quoter->quote($data, $actor, $room);
            self::assertBookable($quote);

            $status = $data->confirm ? ReservationStatus::Confirmed : ReservationStatus::Pending;
            $price = $quote->price;
            $reservation = Reservation::query()->create([
                'customer_id' => $data->customerId,
                'room_id' => $room->id,
                'rate_id' => $quote->rate->rateId,
                'start_date' => $data->startDate,
                'end_date' => $data->endDate,
                'start_time' => $data->startTime,
                'end_time' => $data->endTime,
                'blocked_from' => $quote->period->from,
                'blocked_until' => $quote->period->until,
                'period_is_estimated' => $quote->period->estimated,
                'billing_unit' => $data->billingUnit,
                'quantity' => $price->quantity,
                'applied_unit_price_fcfa' => $price->unitPriceFcfa,
                'gross_fcfa' => $price->grossFcfa,
                'discount_type' => $price->discount?->type,
                'discount_value' => $price->discount?->storedValue(),
                'discount_fcfa' => $price->discountFcfa,
                'discount_reason' => $price->discount?->reason,
                'discount_by' => $price->discount === null ? null : $actor->id,
                'net_fcfa' => $price->netFcfa,
                'status' => $status,
                'notes' => $data->notes,
                'created_by' => $actor->id,
            ]);
            self::storeOccupants($reservation, $data->occupants);

            $after = ReservationSnapshot::of($reservation) + ['occupants' => count($data->occupants)];
            $this->audit->record('reservation.created', 'reservation', $reservation->id, after: $after, actorId: $actor->id);

            if ($status === ReservationStatus::Confirmed) {
                event(new ReservationConfirmed($reservation->id));
            }

            return $reservation;
        });
    }

    /**
     * Confirme une réservation en attente. Le tarif appliqué est celui en vigueur **maintenant**
     * (invariant 3) ; tout écart avec l'estimation initiale est tracé (ancien et nouveau montant).
     */
    public function confirm(Reservation $reservation, User $actor): Reservation
    {
        return DB::transaction(function () use ($reservation, $actor): Reservation {
            $room = $this->rooms->lockForReservation($reservation->room_id) ?? throw ReservationQuoter::roomNotFound();
            /** @var Reservation $reservation */
            $reservation = Reservation::query()->with('occupants')->lockForUpdate()->findOrFail($reservation->id);

            if ($reservation->status !== ReservationStatus::Pending) {
                throw ReservationLifecycleService::invalidStatus($reservation, 'confirmer');
            }

            $before = ReservationSnapshot::of($reservation);
            $data = new ReservationRequestData(
                roomId: $reservation->room_id,
                customerId: $reservation->customer_id,
                startDate: $reservation->start_date->toDateString(),
                endDate: $reservation->end_date->toDateString(),
                startTime: $reservation->start_time,
                endTime: $reservation->end_time,
                billingUnit: $reservation->billing_unit,
                quantity: $reservation->quantity,
                occupants: $reservation->occupants->map(fn ($o) => new OccupantData($o->name, $o->is_primary))->values()->all(),
                discount: $reservation->discount(),
            );
            $quote = $this->quoter->quote($data, $actor, $room, $reservation->id);
            self::assertBookable($quote);

            $reservation->fill([
                'status' => ReservationStatus::Confirmed,
                'rate_id' => $quote->rate->rateId,
                'applied_unit_price_fcfa' => $quote->price->unitPriceFcfa,
                'gross_fcfa' => $quote->price->grossFcfa,
                'discount_fcfa' => $quote->price->discountFcfa,
                'net_fcfa' => $quote->price->netFcfa,
            ])->save();

            $this->audit->record('reservation.confirmed', 'reservation', $reservation->id, $before, ReservationSnapshot::of($reservation), $actor->id);
            event(new ReservationConfirmed($reservation->id));

            return $reservation;
        });
    }

    public static function assertBookable(ReservationQuote $quote): void
    {
        self::assertNotUnderMaintenance($quote->room);

        if ($quote->conflicts !== []) {
            throw new BusinessRuleException(
                "La chambre {$quote->room->number} n'est pas disponible {$quote->period->describe()} : elle est déjà réservée sur tout ou partie de cette période.",
                'Chambre indisponible',
                409,
                'room_unavailable',
                array_map(
                    fn (Reservation $conflict) => ucfirst($conflict->status->label()).' '.$conflict->blockedPeriod()->describe().'.',
                    $quote->conflicts,
                ),
            );
        }
    }

    public static function assertNotUnderMaintenance(RoomSnapshot $room): void
    {
        if ($room->underMaintenance) {
            throw new BusinessRuleException(
                "La chambre {$room->number} est en maintenance : elle ne peut pas être réservée ni occupée.",
                'Chambre en maintenance',
                409,
                'room_under_maintenance',
            );
        }
    }

    /**
     * Un seul occupant principal : le premier marqué comme tel, ou à défaut le premier saisi.
     *
     * @param  list<OccupantData>  $occupants
     */
    public static function storeOccupants(Reservation $reservation, array $occupants): void
    {
        $primaryIndex = 0;
        foreach ($occupants as $index => $occupant) {
            if ($occupant->isPrimary) {
                $primaryIndex = $index;
                break;
            }
        }

        foreach ($occupants as $index => $occupant) {
            $reservation->occupants()->create(['name' => $occupant->name, 'is_primary' => $index === $primaryIndex]);
        }
    }
}
