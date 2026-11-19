<?php

namespace App\Modules\Billing\Domain;

enum InvoiceType: string
{
    case Invoice = 'INVOICE';
    case CreditNote = 'CREDIT_NOTE';

    public function label(): string
    {
        return match ($this) {
            self::Invoice => 'Facture',
            self::CreditNote => 'Avoir',
        };
    }
}
