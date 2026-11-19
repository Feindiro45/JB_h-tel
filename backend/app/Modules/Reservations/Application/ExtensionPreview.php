<?php

namespace App\Modules\Reservations\Application;

use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Domain\PriceBreakdown;
use App\Modules\Reservations\Models\Reservation;

/** Aperçu d'une prolongation : nouvelle période, nouveau prix, supplément et conflits. */
final readonly class ExtensionPreview
{
    /**
     * @param  list<Reservation>  $conflicts
     */
    public function __construct(
        public BlockedPeriod $currentPeriod,
        public BlockedPeriod $newPeriod,
        public PriceBreakdown $currentPrice,
        public PriceBreakdown $proposedPrice,
        public array $conflicts,
    ) {}

    public function supplementFcfa(): int
    {
        return $this->proposedPrice->netFcfa - $this->currentPrice->netFcfa;
    }

    public function isPossible(): bool
    {
        return $this->conflicts === [];
    }
}
