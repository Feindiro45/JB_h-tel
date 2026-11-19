<?php

namespace App\Modules\Cashier\Contracts;

use Carbon\CarbonImmutable;

/** Reçu d'un encaissement, ou avis de remboursement, pour les notifications. */
final readonly class PaymentReceipt
{
    public function __construct(
        public int $reservationId,
        public string $receiptNumber,
        public int $amountFcfa,
        public string $methodLabel,
        public CarbonImmutable $at,
        public ?string $reason = null,
    ) {}
}
