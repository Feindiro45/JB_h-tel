<?php

namespace App\Modules\Reservations\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\ReservationSnapshot;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\DTO\OccupantData;
use App\Modules\Reservations\Events\ReservationCancelled;
use App\Modules\Reservations\Events\ReservationCheckedIn;
use App\Modules\Reservations\Events\ReservationCheckedOut;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\Format;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Arrivée, départ, annulation et occupants (fiche 06, « Gestion individuelle des chambres »).
 * À l'arrivée, la chambre devient « occupée » ; au départ effectif, le séjour est clôturé et la
 * chambre redevient disponible (les autres réservations et la maintenance restent prises en compte).
 * Les montants ne changent jamais lors de ces opérations (Q-15 : pas de recalcul au départ anticipé).
 */
final class ReservationLifecycleService
{
    public function __construct(
        private readonly RoomDirectory $rooms,
        private readonly AuditTrail $audit,
    ) {}

    public function checkIn(Reservation $reservation, User $actor): Reservation
    {
        return DB::transaction(function () use ($reservation, $actor): Reservation {
            $room = $this->rooms->lockForReservation($reservation->room_id) ?? throw ReservationQuoter::roomNotFound();
            $reservation = $this->lock($reservation);

            if ($reservation->status === ReservationStatus::Pending) {
                throw new BusinessRuleException(
                    "Cette réservation est en attente : confirmez-la avant d'enregistrer l'arrivée.",
                    'Réservation non confirmée',
                    409,
                    'reservation_not_confirmed',
                );
            }
            if ($reservation->status !== ReservationStatus::Confirmed) {
                throw self::invalidStatus($reservation, "enregistrer l'arrivée");
            }
            if ($reservation->start_date->toImmutable()->startOfDay()->gt(CarbonImmutable::today())) {
                throw new BusinessRuleException(
                    'L’arrivée est prévue le '.$reservation->start_date->format('d/m/Y').' : elle ne peut pas être enregistrée avant cette date.',
                    'Arrivée anticipée',
                    409,
                    'check_in_too_early',
                );
            }
            ReservationBookingService::assertNotUnderMaintenance($room);

            $stillOccupied = Reservation::query()
                ->where('room_id', $reservation->room_id)
                ->where('status', ReservationStatus::InProgress->value)
                ->whereKeyNot($reservation->id)
                ->exists();
            if ($stillOccupied) {
                throw new BusinessRuleException(
                    "La chambre {$room->number} est encore occupée : enregistrez d'abord le départ du client précédent.",
                    'Chambre encore occupée',
                    409,
                    'room_still_occupied',
                );
            }

            event(new ReservationCheckedIn($reservation->id));

            return $this->transition($reservation, $actor, 'reservation.checked_in', [
                'status' => ReservationStatus::InProgress,
                'checked_in_at' => now(),
                'checked_in_by' => $actor->id,
            ]);
        });
    }

    public function checkOut(Reservation $reservation, User $actor): Reservation
    {
        return DB::transaction(function () use ($reservation, $actor): Reservation {
            $reservation = $this->lock($reservation);
            if ($reservation->status !== ReservationStatus::InProgress) {
                throw self::invalidStatus($reservation, 'enregistrer le départ');
            }

            event(new ReservationCheckedOut($reservation->id));

            return $this->transition($reservation, $actor, 'reservation.checked_out', [
                'status' => ReservationStatus::Completed,
                'checked_out_at' => now(),
                'checked_out_by' => $actor->id,
            ]);
        });
    }

    /** Annulation motivée avant l'arrivée (Q-14, provisoire). Les paiements éventuels sont traités en caisse. */
    public function cancel(Reservation $reservation, string $reason, User $actor): Reservation
    {
        return DB::transaction(function () use ($reservation, $reason, $actor): Reservation {
            $reservation = $this->lock($reservation);

            if ($reservation->status === ReservationStatus::InProgress) {
                throw new BusinessRuleException(
                    'Le client est déjà arrivé : la réservation ne peut plus être annulée. Enregistrez son départ.',
                    'Annulation impossible',
                    409,
                    'cannot_cancel_in_progress',
                );
            }
            if (! in_array($reservation->status, [ReservationStatus::Pending, ReservationStatus::Confirmed], true)) {
                throw self::invalidStatus($reservation, 'annuler');
            }

            event(new ReservationCancelled($reservation->id));

            return $this->transition($reservation, $actor, 'reservation.cancelled', [
                'status' => ReservationStatus::Cancelled,
                'cancelled_at' => now(),
                'cancelled_by' => $actor->id,
                'cancellation_reason' => $reason,
            ]);
        });
    }

    /** @param  list<OccupantData>  $occupants */
    public function replaceOccupants(Reservation $reservation, array $occupants, User $actor): Reservation
    {
        return DB::transaction(function () use ($reservation, $occupants, $actor): Reservation {
            $room = $this->rooms->find($reservation->room_id) ?? throw ReservationQuoter::roomNotFound();
            $reservation = $this->lock($reservation);
            if (! $reservation->status->isOpen()) {
                throw self::invalidStatus($reservation, 'modifier les occupants');
            }
            ReservationQuoter::assertCapacity($room, count($occupants));

            $before = ['occupants' => $reservation->occupants()->pluck('name')->all()];
            $reservation->occupants()->delete();
            ReservationBookingService::storeOccupants($reservation, $occupants);
            $after = ['occupants' => $reservation->occupants()->pluck('name')->all()];

            $this->audit->record('reservation.occupants_updated', 'reservation', $reservation->id, $before, $after, $actor->id);

            return $reservation;
        });
    }

    public static function invalidStatus(Reservation $reservation, string $action): BusinessRuleException
    {
        return new BusinessRuleException(
            "Impossible de {$action} : la réservation est « {$reservation->status->label()} ».",
            'Opération impossible',
            409,
            'invalid_reservation_status',
        );
    }

    private function lock(Reservation $reservation): Reservation
    {
        /** @var Reservation $locked */
        $locked = Reservation::query()->lockForUpdate()->findOrFail($reservation->id);

        return $locked;
    }

    /** @param  array<string, mixed>  $changes */
    private function transition(Reservation $reservation, User $actor, string $action, array $changes): Reservation
    {
        $before = ReservationSnapshot::of($reservation);
        $reservation->fill($changes)->save();
        $after = ReservationSnapshot::of($reservation) + array_filter([
            'at' => isset($changes['checked_in_at']) || isset($changes['checked_out_at']) || isset($changes['cancelled_at'])
                ? Format::dateTime(CarbonImmutable::now()) : null,
            'reason' => $changes['cancellation_reason'] ?? null,
        ]);
        $this->audit->record($action, 'reservation', $reservation->id, $before, $after, $actor->id);

        return $reservation;
    }
}
