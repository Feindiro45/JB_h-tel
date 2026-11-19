<?php

namespace App\Modules\RoomCatalog\Contracts;

use Carbon\CarbonImmutable;

/** Version tarifaire en vigueur, telle que la réservation doit la figer. */
final readonly class AppliedRate
{
    public function __construct(
        public int $rateId,
        public int $roomTypeId,
        public BillingUnit $billingUnit,
        public int $amountFcfa,
        public CarbonImmutable $effectiveFrom,
    ) {}
}
