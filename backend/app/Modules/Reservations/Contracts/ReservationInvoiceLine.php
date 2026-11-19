<?php

namespace App\Modules\Reservations\Contracts;

/**
 * Ligne facturable d'un séjour (D-053) : le séjour initial, puis une ligne par prolongation.
 * La somme des montants est égale au brut de la réservation.
 */
final readonly class ReservationInvoiceLine
{
    public const STAY = 'STAY';

    public const EXTENSION = 'EXTENSION';

    public function __construct(
        public string $kind,
        public string $fromDate,
        public ?string $fromTime,
        public string $toDate,
        public ?string $toTime,
        public int $quantity,
        public int $unitPriceFcfa,
        public int $amountFcfa,
    ) {}
}
