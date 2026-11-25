<?php

namespace App\Modules\Reservations\Contracts;

/** Référence publique du document automatique, sans dépendance au modèle Billing. */
final readonly class InvoiceReference
{
    public function __construct(public string $id, public string $number) {}
}
