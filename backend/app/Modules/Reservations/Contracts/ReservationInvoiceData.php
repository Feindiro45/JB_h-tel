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
    ) {}
}
