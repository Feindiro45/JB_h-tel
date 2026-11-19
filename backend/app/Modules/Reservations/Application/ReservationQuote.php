<?php

namespace App\Modules\Reservations\Application;

use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Domain\PriceBreakdown;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\AppliedRate;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Contracts\RoomSnapshot;

/** Résultat d'un devis : prix calculé et disponibilité, sans rien enregistrer. */
final readonly class ReservationQuote
{
    /**
     * @param  list<Reservation>  $conflicts
     */
    public function __construct(
        public RoomSnapshot $room,
        public BlockedPeriod $period,
        public BillingUnit $billingUnit,
        public AppliedRate $rate,
        public PriceBreakdown $price,
        public array $conflicts,
    ) {}

    public function isAvailable(): bool
    {
        return ! $this->room->underMaintenance && $this->conflicts === [];
    }
}
