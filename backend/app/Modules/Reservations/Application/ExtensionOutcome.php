<?php

namespace App\Modules\Reservations\Application;

use App\Modules\Reservations\Models\Reservation;

/** Résultat d'une prolongation : la réservation et, si elle était facturée, la nouvelle facture (D-053). */
final readonly class ExtensionOutcome
{
    public function __construct(
        public Reservation $reservation,
        public ?string $replacementInvoiceNumber,
    ) {}
}
