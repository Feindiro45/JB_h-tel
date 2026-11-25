<?php

namespace App\Modules\Reservations\Application\Services;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\ExtensionOutcome;
use App\Modules\Reservations\Application\ReservationQuote;
use App\Modules\Reservations\Application\ReservationSnapshot;
use App\Modules\Reservations\Contracts\CancellationRefunds;
use App\Modules\Reservations\Contracts\StayInvoicing;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\DTO\ModificationData;
use App\Modules\Reservations\DTO\OccupantData;
use App\Modules\Reservations\DTO\ReservationRequestData;
use App\Modules\Reservations\Events\ReservationModified;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Models\ReservationExtension;
use App\Modules\Reservations\Models\ReservationOccupant;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\Format;
use Illuminate\Support\Facades\DB;

/**
 * Correction d'une réservation (D-058, demande du 20/11/2026) : chambre, dates, heures, forfait et
 * quantité, tant que le séjour n'a pas commencé. Mêmes contrôles qu'à la création (disponibilité
 * sous verrou, maintenance, capacité, durée), prix recalculé au tarif en vigueur avec la même remise.
 * Une réservation facturée ne se corrige que par un administrateur : la facture est alors remplacée
 * (avoir + nouvelle facture). Le nouveau montant ne peut pas descendre sous l'encaissé (D-014).
 */
final class ReservationModificationService
{
    public function __construct(
        private readonly RoomDirectory $rooms,
        private readonly ReservationQuoter $quoter,
        private readonly CancellationRefunds $payments,
        private readonly StayInvoicing $invoicing,
        private readonly AuditTrail $audit,
    ) {}

    public function preview(Reservation $reservation, ModificationData $data, User $actor): ReservationQuote
    {
        $this->assertModifiable($reservation, $actor);

        return $this->quoter->quote($this->request($reservation, $data), $actor, null, $reservation->id);
    }

    public function modify(Reservation $reservation, ModificationData $data, User $actor): ExtensionOutcome
    {
        return DB::transaction(function () use ($reservation, $data, $actor): ExtensionOutcome {
            $room = $this->rooms->lockForReservation($data->roomId) ?? throw ReservationQuoter::roomNotFound();
            /** @var Reservation $reservation */
            $reservation = Reservation::query()->with('occupants')->lockForUpdate()->findOrFail($reservation->id);
            $invoiced = $this->assertModifiable($reservation, $actor);

            $quote = $this->quoter->quote($this->request($reservation, $data), $actor, $room, $reservation->id);
            ReservationBookingService::assertBookable($quote);

            $collected = $this->payments->netCollected($reservation->id);
            if ($quote->price->netFcfa < $collected) {
                throw new BusinessRuleException(
                    'Le nouveau montant ('.Format::fcfa($quote->price->netFcfa).') serait inférieur à ce qui est déjà encaissé ('.Format::fcfa($collected).').',
                    'Modification impossible',
                    409,
                    'modification_below_collected',
                    ['Faites d’abord rembourser la différence par un administrateur, ou choisissez une période plus longue.'],
                );
            }

            $before = ReservationSnapshot::of($reservation);
            $price = $quote->price;
            $reservation->fill([
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
                'discount_fcfa' => $price->discountFcfa,
                'net_fcfa' => $price->netFcfa,
            ])->save();

            $this->audit->record('reservation.modified', 'reservation', $reservation->id, $before, ReservationSnapshot::of($reservation) + [
                'reason' => $data->reason,
            ], $actor->id);
            event(new ReservationModified($reservation->id));

            $invoice = $invoiced
                ? $this->invoicing->replaceAfterChange($reservation->id, 'Réservation modifiée : '.$data->reason, $actor)
                : null;

            return new ExtensionOutcome($reservation, $invoice);
        });
    }

    /** @return bool Vrai si le séjour a une facture active (à remplacer). */
    private function assertModifiable(Reservation $reservation, User $actor): bool
    {
        if (! in_array($reservation->status, [ReservationStatus::Pending, ReservationStatus::Confirmed], true)) {
            throw new BusinessRuleException(
                'Seule une réservation en attente ou confirmée, dont le séjour n’a pas commencé, peut être modifiée. Pour un séjour en cours, utilisez la prolongation.',
                'Modification impossible',
                409,
                'reservation_not_modifiable',
            );
        }
        if (ReservationExtension::query()->where('reservation_id', $reservation->id)->exists()) {
            throw new BusinessRuleException(
                'Cette réservation a déjà été prolongée : pour la corriger, annulez-la puis créez-en une nouvelle.',
                'Modification impossible',
                409,
                'reservation_extended',
            );
        }
        $invoiced = $this->invoicing->hasActiveInvoice($reservation->id);
        if ($invoiced && ! $actor->can(PermissionName::InvoicesCredit->value)) {
            throw new BusinessRuleException(
                'Cette réservation est déjà facturée : seul un administrateur peut la modifier. La facture sera alors remplacée par un avoir et une nouvelle facture.',
                'Modification réservée',
                403,
                'modification_requires_admin',
            );
        }

        return $invoiced;
    }

    private function request(Reservation $reservation, ModificationData $data): ReservationRequestData
    {
        return new ReservationRequestData(
            roomId: $data->roomId,
            customerId: $reservation->customer_id,
            startDate: $data->startDate,
            endDate: $data->endDate,
            startTime: $data->startTime,
            endTime: $data->endTime,
            billingUnit: $data->billingUnit,
            quantity: $data->quantity,
            occupants: $reservation->occupants->map(fn (ReservationOccupant $o) => new OccupantData($o->name, $o->is_primary))->values()->all(),
            discount: $reservation->discount(),
            notes: $reservation->notes,
            pricedAt: $data->pricedAt,
            expectedUnitPriceFcfa: $data->expectedUnitPriceFcfa,
        );
    }
}
