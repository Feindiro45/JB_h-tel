<?php

namespace App\Modules\RoomCatalog\Application\Queries;

use App\Modules\RoomCatalog\Domain\RateStatus;
use App\Modules\RoomCatalog\Models\RoomRate;

final readonly class RateHistoryEntry
{
    public function __construct(
        public RoomRate $rate,
        public ?int $previousAmountFcfa,
        public RateStatus $status,
    ) {}
}
