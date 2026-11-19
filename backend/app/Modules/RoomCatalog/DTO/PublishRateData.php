<?php

namespace App\Modules\RoomCatalog\DTO;

use App\Modules\RoomCatalog\Contracts\BillingUnit;
use Carbon\CarbonImmutable;

final readonly class PublishRateData
{
    /**
     * @param  CarbonImmutable|null  $effectiveFrom  Date d'effet ; `null` = immédiatement.
     */
    public function __construct(
        public int $roomTypeId,
        public BillingUnit $billingUnit,
        public int $amountFcfa,
        public string $reason,
        public ?CarbonImmutable $effectiveFrom = null,
    ) {}
}
