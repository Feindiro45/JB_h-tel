<?php

namespace App\Modules\Reservations\Domain;

enum DiscountType: string
{
    case Percent = 'PERCENT';
    case Fixed = 'FIXED';

    public function label(): string
    {
        return match ($this) {
            self::Percent => 'Pourcentage',
            self::Fixed => 'Montant fixe',
        };
    }
}
