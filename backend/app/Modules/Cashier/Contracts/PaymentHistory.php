<?php

namespace App\Modules\Cashier\Contracts;

/** Accès en lecture aux encaissements, pour la facturation et les rapports. */
interface PaymentHistory
{
    public function forReservation(int $reservationId): PaymentStatement;
}
