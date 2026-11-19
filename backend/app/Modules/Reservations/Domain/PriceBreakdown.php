<?php

namespace App\Modules\Reservations\Domain;

/** Détail du prix figé sur la réservation (montants entiers FCFA). */
final readonly class PriceBreakdown
{
    public function __construct(
        public int $unitPriceFcfa,
        public int $quantity,
        public int $grossFcfa,
        public ?Discount $discount,
        public int $discountFcfa,
        public int $netFcfa,
    ) {}
}
