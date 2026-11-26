<?php

namespace App\Modules\Reservations\DTO;

use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Domain\Discount;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use Carbon\CarbonInterface;

/** Demande de réservation (ou de devis), avec les identifiants internes déjà résolus. */
final readonly class ReservationRequestData
{
    /**
     * @param  list<OccupantData>  $occupants
     */
    public function __construct(
        public int $roomId,
        public ?int $customerId,
        public string $startDate,
        public string $endDate,
        public ?string $startTime,
        public ?string $endTime,
        public BillingUnit $billingUnit,
        public int $quantity,
        public array $occupants,
        public ?Discount $discount = null,
        public ?string $notes = null,
        public bool $confirm = true,
        /** N-09 : moment du tarif (opération faite hors ligne) ; `null` = maintenant. */
        public ?CarbonInterface $pricedAt = null,
        public ?int $expectedUnitPriceFcfa = null,
        /** D-072 : salle de conférence ; `null` pour une chambre. */
        public ?EventData $event = null,
    ) {}

    public function period(): BlockedPeriod
    {
        return BlockedPeriod::fromStay($this->startDate, $this->endDate, $this->startTime, $this->endTime);
    }
}
