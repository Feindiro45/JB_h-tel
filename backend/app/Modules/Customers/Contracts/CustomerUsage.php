<?php

namespace App\Modules\Customers\Contracts;

/**
 * Port implémenté par le module Reservations (D-058) : un client lié à au moins une réservation,
 * même annulée, ne se supprime pas (son historique de séjours doit rester lisible).
 */
interface CustomerUsage
{
    public function isUsed(int $customerId): bool;
}
