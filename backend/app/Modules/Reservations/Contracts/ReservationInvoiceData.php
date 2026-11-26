<?php

namespace App\Modules\Reservations\Contracts;

/** Détail facturable d'une réservation, figé dans l'instantané de la facture (module Billing). */
final readonly class ReservationInvoiceData
{
    public function __construct(
        public int $id,
        public string $uuid,
        public string $status,
        public string $statusLabel,
        public int $customerId,
        public int $roomId,
        public string $startDate,
        public string $endDate,
        public ?string $startTime,
        public ?string $endTime,
        public string $blockedFrom,
        public string $blockedUntil,
        public bool $periodIsEstimated,
        public string $billingUnit,
        public string $billingUnitLabel,
        public int $quantity,
        public int $unitPriceFcfa,
        public int $grossFcfa,
        public ?string $discountLabel,
        public ?string $discountReason,
        public int $discountFcfa,
        public int $netFcfa,
        /**
         * Séjour initial puis une ligne par prolongation (D-053) ; somme des montants = brut.
         *
         * @var list<ReservationInvoiceLine>
         */
        public array $lines = [],
        /**
         * Salle de conférence (D-072) : événement, type d'occupant, organisation et contact ;
         * `null` pour une chambre.
         *
         * @var array{name: string, organizer: string, organization_name: ?string, contact_name: ?string, contact_phone: ?string}|null
         */
        public ?array $event = null,
    ) {}
}
