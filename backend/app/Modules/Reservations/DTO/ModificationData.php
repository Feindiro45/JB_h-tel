<?php

namespace App\Modules\Reservations\DTO;

use App\Modules\RoomCatalog\Contracts\BillingUnit;

/** Correction d'une réservation pas encore commencée (D-058) : nouvelle chambre, période, forfait. */
final readonly class ModificationData
{
    public function __construct(
        public int $roomId,
        public string $startDate,
        public string $endDate,
        public ?string $startTime,
        public ?string $endTime,
        public BillingUnit $billingUnit,
        public int $quantity,
        public string $reason,
    ) {}
}
