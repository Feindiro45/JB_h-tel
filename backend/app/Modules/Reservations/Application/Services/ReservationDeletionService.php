<?php

namespace App\Modules\Reservations\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\ReservationSnapshot;
use App\Modules\Reservations\Contracts\CancellationRefunds;
use App\Modules\Reservations\Contracts\StayInvoicing;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Models\ReservationExtension;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\RecordDeletion;
use Illuminate\Support\Facades\DB;

/**
 * Suppression définitive d'une réservation saisie par erreur (D-058, administrateur). Seulement si
 * aucun encaissement (même annulé) ni aucun document (facture, avoir) n'existe : l'argent et les
 * pièces comptables ne disparaissent jamais. Occupants et prolongations sont supprimés avec elle ;
 * le journal d'audit en garde une copie complète.
 */
final class ReservationDeletionService
{
    public function __construct(
        private readonly CancellationRefunds $payments,
        private readonly StayInvoicing $invoicing,
        private readonly RecordDeletion $deletion,
    ) {}

    public function delete(Reservation $reservation, string $reason, User $actor): void
    {
        DB::transaction(function () use ($reservation, $reason, $actor): void {
            /** @var Reservation $reservation */
            $reservation = Reservation::query()->with('occupants')->lockForUpdate()->findOrFail($reservation->id);

            if ($this->payments->hasPayments($reservation->id)) {
                throw new BusinessRuleException(
                    'Des encaissements sont enregistrés sur cette réservation (même annulés) : elle ne peut pas être supprimée. Annulez-la plutôt.',
                    'Suppression impossible',
                    409,
                    'reservation_has_payments',
                );
            }
            if ($this->invoicing->hasDocuments($reservation->id)) {
                throw new BusinessRuleException(
                    'Une facture ou un avoir existe pour cette réservation : elle ne peut pas être supprimée. Annulez-la plutôt.',
                    'Suppression impossible',
                    409,
                    'reservation_has_invoices',
                );
            }

            $snapshot = ReservationSnapshot::of($reservation) + [
                'occupants' => $reservation->occupants->pluck('name')->all(),
                'extensions' => ReservationExtension::query()->where('reservation_id', $reservation->id)->count(),
            ];
            // Lignes dépendantes : les prolongations sont figées (modèle), on les retire avec la réservation.
            $reservation->occupants()->delete();
            ReservationExtension::query()->where('reservation_id', $reservation->id)->toBase()->delete();

            $this->deletion->delete($reservation, 'reservation.deleted', 'reservation', $snapshot, $reason, $actor,
                'Cette réservation est encore utilisée ailleurs : elle ne peut pas être supprimée. Annulez-la plutôt.');
        });
    }
}
