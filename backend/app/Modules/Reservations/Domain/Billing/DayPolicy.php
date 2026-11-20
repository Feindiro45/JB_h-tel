<?php

namespace App\Modules\Reservations\Domain\Billing;

/**
 * D-055 : la quantité vient de l'écart entre les dates civiles, pas de la durée en minutes.
 * Aucun horaire ni arrondi horaire n'est imposé (partie restante de Q-01).
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
