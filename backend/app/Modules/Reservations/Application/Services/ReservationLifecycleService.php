<?php

namespace App\Modules\Reservations\Application\Services;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\ReservationSnapshot;
use App\Modules\Reservations\Contracts\CancellationRefunds;
use App\Modules\Reservations\Contracts\StayInvoicing;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\DTO\CancellationData;
use App\Modules\Reservations\DTO\CheckOutData;
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
        private readonly CancellationRefunds $refunds,
        private readonly StayInvoicing $invoicing,
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

    /**
     * Départ. D-071 (décision de l'utilisateur) : un séjour qui n'est pas entièrement payé peut
     * être clôturé, mais seulement avec le motif pour lequel le client part sans tout régler ; le
     * solde et le motif sont écrits dans le journal d'audit. Le solde est lu sous verrou.
     */
    public function checkOut(Reservation $reservation, CheckOutData $data, User $actor): Reservation
    {
        return DB::transaction(function () use ($reservation, $data, $actor): Reservation {
            // Même ordre de verrouillage que la réservation et la prolongation (D-056).
            $this->rooms->lockForReservation($reservation->room_id) ?? throw ReservationQuoter::roomNotFound();
            $reservation = $this->lock($reservation);
            if ($reservation->status !== ReservationStatus::InProgress) {
                throw self::invalidStatus($reservation, 'enregistrer le départ');
            }

            $unpaid = max(0, $reservation->net_fcfa - $this->refunds->netCollected($reservation->id));
            if ($unpaid > 0 && $data->unpaidReason === null) {
                throw new BusinessRuleException(
                    'Il reste '.Format::fcfa($unpaid).' à encaisser sur ce séjour.',
                    'Solde impayé au départ',
                    409,
                    'checkout_unpaid_balance',
                    [
                        'Encaissez le solde, puis enregistrez le départ.',
                        'Si le client part sans tout payer, indiquez le motif : il sera enregistré dans le journal.',
                    ],
                );
            }

            event(new ReservationCheckedOut($reservation->id));

            return $this->transition($reservation, $actor, 'reservation.checked_out', [
                'status' => ReservationStatus::Completed,
                'checked_out_at' => now(),
                'checked_out_by' => $actor->id,
            ], $unpaid > 0 ? ['unpaid_balance_fcfa' => $unpaid, 'unpaid_reason' => $data->unpaidReason] : []);
        });
    }

    /** Annulation motivée avant l'arrivée (Q-14, provisoire). Les paiements éventuels sont traités en caisse. */
    /**
     * Annulation (D-031, D-053). Une réservation annulée ne doit plus rien : dans la même transaction,
     * ce qui a été encaissé est remboursé intégralement (montant confirmé par l'utilisateur, droit de
     * rembourser exigé) et la facture active est annulée par un avoir. La caisse et le facturé ne
     * comptent donc plus ce séjour, qu'il ait été payé ou non.
     */
    public function cancel(Reservation $reservation, CancellationData $data, User $actor): Reservation
    {
        return DB::transaction(function () use ($reservation, $data, $actor): Reservation {
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

            $collected = $this->refunds->netCollected($reservation->id);
            if ($collected > 0 && ! $actor->can(PermissionName::RefundsCreate->value)) {
                throw new BusinessRuleException(
                    'Cette réservation a déjà '.Format::fcfa($collected).' encaissés. Son annulation rembourse cette somme au client : seul un compte autorisé à rembourser (administrateur) peut l’effectuer.',
                    'Remboursement nécessaire',
                    403,
                    'cancellation_requires_refund',
                    ['Demandez à un administrateur d’annuler la réservation et de rembourser '.Format::fcfa($collected).'.'],
                );
            }
            if ($data->refundFcfa !== $collected) {
                throw new BusinessRuleException(
                    $collected > 0
                        ? 'Confirmez le remboursement de '.Format::fcfa($collected).' encaissés sur ce séjour avant de l’annuler.'
                        : 'Aucun montant n’est encaissé sur ce séjour : il n’y a rien à rembourser.',
                    'Montant à rembourser à confirmer',
                    409,
                    'cancellation_refund_mismatch',
                    ['Montant encaissé à rembourser : '.Format::fcfa($collected).'.'],
                );
            }

            event(new ReservationCancelled($reservation->id));

            $reservation = $this->transition($reservation, $actor, 'reservation.cancelled', [
                'status' => ReservationStatus::Cancelled,
                'cancelled_at' => now(),
                'cancelled_by' => $actor->id,
                'cancellation_reason' => $data->reason,
            ]);

            if ($collected > 0) {
                $this->refunds->refundAll($reservation->id, $data->refundMethod, 'Annulation de la réservation : '.$data->reason, $actor);
            }
            $this->invoicing->creditOnCancellation($reservation->id, 'Annulation de la réservation : '.$data->reason, $actor);

            return $reservation;
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

    /**
     * @param  array<string, mixed>  $changes
     * @param  array<string, mixed>  $auditExtra  champs ajoutés à l'état « après » du journal (D-071)
     */
    private function transition(Reservation $reservation, User $actor, string $action, array $changes, array $auditExtra = []): Reservation
    {
        $before = ReservationSnapshot::of($reservation);
        $reservation->fill($changes)->save();
        $after = ReservationSnapshot::of($reservation) + array_filter([
            'at' => isset($changes['checked_in_at']) || isset($changes['checked_out_at']) || isset($changes['cancelled_at'])
                ? Format::dateTime(CarbonImmutable::now()) : null,
            'reason' => $changes['cancellation_reason'] ?? null,
        ]) + $auditExtra;
        $this->audit->record($action, 'reservation', $reservation->id, $before, $after, $actor->id);

        return $reservation;
    }
}
