<?php

namespace App\Modules\Reservations\Domain\Billing;

/**
 * Demi-journée (règle validée, D-007) : forfait couvrant toute durée positive jusqu'à N heures
 * incluses (N = 12, paramètre `billing.half_day_max_hours`). Pas de facturation horaire, et aucune
 * conversion automatique en journée.
 */
final readonly class HalfDayPolicy implements BillingUnitPolicy
{
    public function __construct(private int $maxHours) {}

    public function maxCoveredMinutes(int $quantity): int
    {
        return $quantity * $this->maxHours * 60;
    }

    public function requiredQuantity(int $minutes): int
    {
        return max(1, intdiv($minutes + $this->maxHours * 60 - 1, $this->maxHours * 60));
    }

    public function maxHours(): int
    {
        return $this->maxHours;
    }
}
