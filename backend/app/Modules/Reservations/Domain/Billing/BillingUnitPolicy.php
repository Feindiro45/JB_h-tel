<?php

namespace App\Modules\Reservations\Domain\Billing;

/**
 * Règle de durée propre à une unité de facturation (stratégie, principe OCP du document 02).
 * Une nouvelle unité ajoute une implémentation sans modifier le service de réservation.
 */
interface BillingUnitPolicy
{
    /**
     * Durée maximale couverte, en minutes, pour la quantité donnée ; `null` = aucune limite
     * contrôlée par l'application.
     */
    public function maxCoveredMinutes(int $quantity): ?int;

    /** Quantité minimale couvrant la durée donnée, ou `null` si non applicable. */
    public function requiredQuantity(int $minutes): ?int;
}
