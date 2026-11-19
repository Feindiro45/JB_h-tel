<?php

namespace App\Modules\Cashier\Contracts;

/** Relevé des encaissements validés d'une réservation (paiements annulés exclus). */
final readonly class PaymentStatement
{
    /**
     * @param  list<PaymentLine>  $lines
     */
    public function __construct(
        public array $lines,
        public int $paidFcfa,
        public int $refundedFcfa,
    ) {}

    public function netPaidFcfa(): int
    {
        return $this->paidFcfa - $this->refundedFcfa;
    }
}
