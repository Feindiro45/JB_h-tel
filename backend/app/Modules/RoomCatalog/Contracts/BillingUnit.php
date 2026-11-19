<?php

namespace App\Modules\RoomCatalog\Contracts;

/**
 * Unités de facturation : demi-journée et journée uniquement, pas de tarif horaire
 * (cahier des charges). Fait partie de l'API publique du module RoomCatalog.
 */
enum BillingUnit: string
{
    case HalfDay = 'HALF_DAY';
    case Day = 'DAY';

    public function label(): string
    {
        return match ($this) {
            self::HalfDay => 'Demi-journée',
            self::Day => 'Journée',
        };
    }
}
