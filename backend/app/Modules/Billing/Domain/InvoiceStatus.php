<?php

namespace App\Modules\Billing\Domain;

enum InvoiceStatus: string
{
    case Issued = 'ISSUED';
    case Credited = 'CREDITED';

    public function label(): string
    {
        return match ($this) {
            self::Issued => 'Émise',
            self::Credited => 'Annulée par avoir',
        };
    }
}
