<?php

namespace App\Modules\Cashier\Contracts;

/** Accès en lecture aux encaissements, pour la facturation, les notifications et les rapports. */
interface PaymentHistory
{
    public function forReservation(int $reservationId): PaymentStatement;

    /** Reçu d'un encaissement (numéro, montant, moyen, date). */
    public function receipt(int $paymentId): ?PaymentReceipt;

    /** Avis de remboursement : numéro du reçu remboursé, montant, motif, date. */
    public function refund(int $refundId): ?PaymentReceipt;
}
