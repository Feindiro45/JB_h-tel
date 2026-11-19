<?php

namespace App\Modules\Reservations\Contracts;

/** Accès en lecture au montant dû des réservations, pour les modules Cashier et Billing. */
interface ReservationLedger
{
    public function find(int $reservationId): ?ReservationDue;

    public function findByUuid(string $uuid): ?ReservationDue;

    /**
     * Lecture groupée, pour les listes (journal de caisse, reçus) : une seule requête.
     *
     * @param  list<int>  $reservationIds
     * @return array<int, ReservationDue> Indexé par identifiant interne.
     */
    public function findMany(array $reservationIds): array;

    /**
     * Verrouille la réservation (`SELECT … FOR UPDATE`) jusqu'à la fin de la transaction : deux
     * encaissements simultanés sur une même réservation sont traités l'un après l'autre, et le
     * contrôle du trop-perçu reste exact. À appeler **dans** une transaction.
     */
    /**
     * Réservations de ces clients, pour les filtres « client » de la caisse et des factures.
     *
     * @param  list<int>  $customerIds
     * @return list<int>
     */
    public function idsForCustomers(array $customerIds): array;

    public function lockForPayment(int $reservationId): ?ReservationDue;

    /** Détail facturable (période, unité, quantité, prix, remise, net), lu au moment de l'émission. */
    public function invoiceData(int $reservationId): ?ReservationInvoiceData;
}
