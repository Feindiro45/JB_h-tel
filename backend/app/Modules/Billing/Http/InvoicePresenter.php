<?php

namespace App\Modules\Billing\Http;

use App\Modules\Billing\Application\InvoiceVerification;
use App\Modules\Billing\Models\Invoice;

/** Représentation JSON d'une facture ou d'un avoir : identifiants publics (UUID) et instantané figé. */
final class InvoicePresenter
{
    /** @return array<string, mixed> */
    public static function invoice(Invoice $invoice, bool $withSnapshot = true): array
    {
        $invoice->loadMissing('creditedInvoice');

        return [
            'id' => $invoice->uuid,
            'type' => $invoice->type->value,
            'type_label' => $invoice->type->label(),
            'number' => $invoice->invoice_number,
            'issued_at' => $invoice->issued_at->toIso8601String(),
            'status' => $invoice->status->value,
            'status_label' => $invoice->status->label(),
            'credited_invoice' => $invoice->creditedInvoice === null ? null : [
                'id' => $invoice->creditedInvoice->uuid,
                'number' => $invoice->creditedInvoice->invoice_number,
            ],
            'gross_fcfa' => $invoice->gross_fcfa,
            'discount_fcfa' => $invoice->discount_fcfa,
            'net_fcfa' => $invoice->net_fcfa,
            // Adresse encodée dans le QR code (réservée aux utilisateurs authentifiés).
            'verification_url' => app(InvoiceVerification::class)->url($invoice),
        ] + ($withSnapshot ? ['snapshot' => $invoice->snapshot_json] : []);
    }
}
