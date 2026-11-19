<?php

namespace App\Modules\Cashier\Domain;

enum PaymentStatus: string
{
    case Valid = 'VALID';
    case Cancelled = 'CANCELLED';

    public function label(): string
    {
        return match ($this) {
            self::Valid => 'Validé',
            self::Cancelled => 'Annulé',
        };
    }
}
