<?php

namespace App\Modules\Billing\Contracts;

/** Accès en lecture aux factures émises, pour les autres modules (notifications). */
interface InvoiceDocuments
{
    public function find(int $invoiceId): ?InvoiceDocument;
}
