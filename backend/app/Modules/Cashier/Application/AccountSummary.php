<?php

namespace App\Modules\Cashier\Application;

/**
 * Situation de caisse d'une réservation (montants entiers FCFA).
 * Encaissé net = paiements validés − remboursements (paiements annulés exclus).
 * Solde = montant exigible − encaissé net ; un solde négatif est un trop-perçu à rembourser
 * (cas d'une réservation annulée après versement).
 */
final readonly class AccountSummary
{
    public function __construct(
        public int $amountDueFcfa,
        public int $paidFcfa,
        public int $refundedFcfa,
    ) {}

    public function netPaidFcfa(): int
    {
        return $this->paidFcfa - $this->refundedFcfa;
    }

    public function balanceFcfa(): int
    {
        return $this->amountDueFcfa - $this->netPaidFcfa();
    }

    public function status(): string
    {
        return match (true) {
            $this->balanceFcfa() < 0 => 'TO_REFUND',
            $this->amountDueFcfa === 0 && $this->netPaidFcfa() === 0 => 'NOTHING_DUE',
            $this->netPaidFcfa() === 0 => 'UNPAID',
            $this->balanceFcfa() > 0 => 'PARTIALLY_PAID',
            default => 'PAID',
        };
    }

    public function statusLabel(): string
    {
        return match ($this->status()) {
            'TO_REFUND' => 'Trop-perçu à rembourser',
            'NOTHING_DUE' => 'Rien à payer',
            'UNPAID' => 'Non payé',
            'PARTIALLY_PAID' => 'Partiellement payé',
            default => 'Soldé',
        };
    }

    /** @return array<string, int|string> */
    public function toArray(): array
    {
        return [
            'amount_due_fcfa' => $this->amountDueFcfa,
            'paid_fcfa' => $this->paidFcfa,
            'refunded_fcfa' => $this->refundedFcfa,
            'net_paid_fcfa' => $this->netPaidFcfa(),
            'balance_fcfa' => $this->balanceFcfa(),
            'status' => $this->status(),
            'status_label' => $this->statusLabel(),
        ];
    }
}
