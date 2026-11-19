<?php

namespace App\Modules\Reservations\Contracts;

/** Accès en lecture au montant dû des réservations, pour les modules Cashier et Billing. */
interface ReservationLedger
{
    public function find(int $reservationId): ?ReservationDue;

    public function findByUuid(string $uuid): ?ReservationDue;

    /**
     * Verrouille la réservation (`SELECT … FOR UPDATE`) jusqu'à la fin de la transaction : deux
     * encaissements simultanés sur une même réservation sont traités l'un après l'autre, et le
     * contrôle du trop-perçu reste exact. À appeler **dans** une transaction.
     */
    public function lockForPayment(int $reservationId): ?ReservationDue;
}
