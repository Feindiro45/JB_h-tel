<?php

namespace App\Modules\Reservations\Domain\Billing;

/**
 * Journée : la définition exacte (durée, plage, arrondis) n'est pas validée (Q-01). En attendant,
 * l'application n'impose aucune règle de durée : la caissière choisit la quantité (D-009, provisoire).
 */
final class DayPolicy implements BillingUnitPolicy
{
    public function maxCoveredMinutes(int $quantity): ?int
    {
        return null;
    }

    public function requiredQuantity(int $minutes): ?int
    {
        return null;
    }
}
