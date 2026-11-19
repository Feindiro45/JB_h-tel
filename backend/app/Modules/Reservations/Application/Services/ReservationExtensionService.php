<?php

namespace App\Modules\Reservations\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\ExtensionPreview;
use App\Modules\Reservations\Application\ReservationSnapshot;
use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Domain\Contracts\RoomAvailability;
use App\Modules\Reservations\Domain\PriceBreakdown;
use App\Modules\Reservations\Domain\PriceCalculator;
use App\Modules\Reservations\DTO\ExtensionData;
use App\Modules\Reservations\Events\ReservationExtended;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\Format;
use Illuminate\Support\Facades\DB;

/**
 * Prolongation (règles validées) : avant toute modification, l'application vérifie les conflits,
 * affiche le supplément proposé et exige une confirmation explicite ; l'auteur, la date, l'ancien
 * et le nouveau montant sont journalisés.
 *
 * Provisoire (D-030, Q-18) : le supplément est calculé au prix unitaire figé de la réservation ;
 * une remise en pourcentage s'applique au nouveau brut, une remise fixe reste inchangée.
 */
final class ReservationExtensionService
{
    public function __construct(
        private readonly RoomDirectory $rooms,
        private readonly RoomAvailability $availability,
        private readonly ReservationQuoter $quoter,
        private readonly PriceCalculator $calculator,
        private readonly AuditTrail $audit,
    ) {}

    public function preview(Reservation $reservation, ExtensionData $data): ExtensionPreview
    {
        if (! in_array($reservation->status->value, ['PENDING', 'CONFIRMED', 'IN_PROGRESS'], true)) {
            throw ReservationLifecycleService::invalidStatus($reservation, 'prolonger le séjour');
        }

        $current = $reservation->blockedPeriod();
        $newPeriod = BlockedPeriod::fromStay(
            $reservation->start_date->toDateString(),
            $data->endDate,
            $reservation->start_time,
            $data->endTime,
        );
        if (! $newPeriod->until->gt($current->until)) {
            throw new BusinessRuleException(
                'La nouvelle fin de séjour doit être postérieure à la fin actuelle ('.Format::dateTime($current->until).').',
                'Prolongation invalide',
                422,
                'extension_not_later',
            );
        }

        $quantity = $reservation->quantity + $data->additionalQuantity;
        $this->quoter->assertDuration($reservation->billing_unit, $quantity, $newPeriod, $reservation->applied_unit_price_fcfa);

        $currentPrice = new PriceBreakdown(
            $reservation->applied_unit_price_fcfa,
            $reservation->quantity,
            $reservation->gross_fcfa,
            $reservation->discount(),
            $reservation->discount_fcfa,
            $reservation->net_fcfa,
        );
        $proposedPrice = $this->calculator->compute($reservation->applied_unit_price_fcfa, $quantity, $reservation->discount());

        // Seule la partie ajoutée de la période est à vérifier ; la réservation elle-même est exclue.
        $conflicts = $this->availability->conflicts($reservation->room_id, $current->until, $newPeriod->until, $reservation->id);

        return new ExtensionPreview($current, $newPeriod, $currentPrice, $proposedPrice, $conflicts);
    }

    public function extend(Reservation $reservation, ExtensionData $data, User $actor): Reservation
    {
        return DB::transaction(function () use ($reservation, $data, $actor): Reservation {
            $room = $this->rooms->lockForReservation($reservation->room_id) ?? throw ReservationQuoter::roomNotFound();
            /** @var Reservation $reservation */
            $reservation = Reservation::query()->lockForUpdate()->findOrFail($reservation->id);
            $preview = $this->preview($reservation, $data);

            if (! $preview->isPossible()) {
                throw new BusinessRuleException(
                    "La chambre {$room->number} n'est pas libre pour la prolongation {$preview->newPeriod->describe()}.",
                    'Prolongation impossible',
                    409,
                    'room_unavailable',
                    array_map(fn (Reservation $c) => ucfirst($c->status->label()).' '.$c->blockedPeriod()->describe().'.', $preview->conflicts),
                );
            }
            if (! $data->confirmed) {
                throw new BusinessRuleException(
                    'Confirmez explicitement la prolongation et son supplément de '.Format::fcfa($preview->supplementFcfa()).'.',
                    'Confirmation requise',
                    422,
                    'extension_not_confirmed',
                    ['Nouveau montant net : '.Format::fcfa($preview->proposedPrice->netFcfa).' (au lieu de '.Format::fcfa($preview->currentPrice->netFcfa).').'],
                );
            }

            $before = ReservationSnapshot::of($reservation);
            $reservation->fill([
                'end_date' => $data->endDate,
                'end_time' => $data->endTime,
                'blocked_until' => $preview->newPeriod->until,
                'period_is_estimated' => $preview->newPeriod->estimated,
                'quantity' => $preview->proposedPrice->quantity,
                'gross_fcfa' => $preview->proposedPrice->grossFcfa,
                'discount_fcfa' => $preview->proposedPrice->discountFcfa,
                'net_fcfa' => $preview->proposedPrice->netFcfa,
            ])->save();

            $this->audit->record('reservation.extended', 'reservation', $reservation->id, $before, ReservationSnapshot::of($reservation) + [
                'supplement_fcfa' => $preview->supplementFcfa(),
            ], $actor->id);
            event(new ReservationExtended($reservation->id));

            return $reservation;
        });
    }
}
