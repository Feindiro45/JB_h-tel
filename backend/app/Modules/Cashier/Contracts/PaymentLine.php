<?php

namespace App\Modules\Cashier\Contracts;

use Carbon\CarbonImmutable;

/** Ligne d'encaissement telle qu'elle figure sur une facture (versements). */
final readonly class PaymentLine
{
    public function __construct(
        public string $receiptNumber,
        public CarbonImmutable $receivedAt,
        public int $amountFcfa,
        public string $methodLabel,
        public int $refundedFcfa,
    ) {}
}
