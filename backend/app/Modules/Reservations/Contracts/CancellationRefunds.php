<?php

namespace App\Modules\Reservations\Contracts;

use App\Modules\Identity\Models\User;

/**
 * Port vers la caisse, implémenté par le module Cashier (D-053). Une réservation annulée ne doit
 * plus rien : ce qui a été encaissé est remboursé dans la même transaction que l'annulation, pour
 * que la caisse ne compte plus ce séjour.
 */
interface CancellationRefunds
{
    /** Encaissé net du séjour : versements valides moins remboursements. */
    public function netCollected(int $reservationId): int;

    /** Au moins un encaissement, même annulé (D-058 : une réservation avec de l'argent ne se supprime pas). */
    public function hasPayments(int $reservationId): bool;

    /** @return list<string> Moyens de remboursement acceptés. */
    public function acceptedMethods(): array;

    /**
     * Rembourse intégralement chaque versement encore remboursable (une ligne de remboursement par
     * reçu, motif commun). À appeler dans la transaction de l'annulation. Renvoie le total remboursé.
     */
    public function refundAll(int $reservationId, ?string $method, string $reason, User $actor): int;
}
