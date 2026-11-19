<?php

namespace App\Modules\Reservations\Contracts;

use App\Modules\Identity\Models\User;

/**
 * Port vers la facturation, implémenté par le module Billing (D-053). Appelé dans la transaction de
 * l'opération sur le séjour, pour que la facture ne contredise jamais la réservation.
 */
interface StayInvoicing
{
    /**
     * Séjour annulé : la facture active est annulée par un avoir. Renvoie le numéro de l'avoir, ou
     * null s'il n'y avait pas de facture active.
     */
    public function creditOnCancellation(int $reservationId, string $reason, User $actor): ?string;

    /**
     * Séjour prolongé : la facture active est annulée par un avoir et remplacée par une nouvelle
     * facture qui détaille le séjour initial et chaque prolongation. Renvoie le numéro de la nouvelle
     * facture, ou null s'il n'y avait pas de facture active (la prochaine facture sera détaillée).
     */
    public function replaceAfterExtension(int $reservationId, User $actor): ?string;
}
