<?php

namespace App\Modules\Reservations\DTO;

use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use Carbon\CarbonImmutable;

/**
 * Filtres de la liste des réservations, partagés par l'écran et l'export Excel. Les chambres,
 * catégories et clients sont désignés par leur UUID public (D-026).
 */
final readonly class ReservationFilters
{
    public function __construct(
        public ?ReservationStatus $status = null,
        public ?string $roomUuid = null,
        public ?string $roomTypeUuid = null,
        public ?string $customerUuid = null,
        public ?string $search = null,
        public ?BillingUnit $billingUnit = null,
        /** Période qui chevauche `from`–`to` (jours entiers, fuseau de l'hôtel). */
        public ?CarbonImmutable $from = null,
        public ?CarbonImmutable $to = null,
    ) {}
}
