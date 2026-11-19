<?php

namespace App\Modules\Billing\Application;

use App\Modules\Billing\Models\Invoice;
use Barryvdh\DomPDF\Facade\Pdf;
use Barryvdh\DomPDF\PDF as DomPdf;

/**
 * PDF A4 d'une facture ou d'un avoir, construit **uniquement** à partir de l'instantané figé
 * (identique à chaque impression), avec le QR code de vérification publique (D-038).
 */
final class InvoicePdfRenderer
{
    public function __construct(private readonly InvoiceVerification $verification) {}

    public function document(Invoice $invoice): DomPdf
    {
        return Pdf::loadView('billing.invoice', [
            'doc' => $invoice->snapshot_json,
            'status' => $invoice->status->label(),
            'qr' => $this->verification->qrDataUri($invoice),
            'verificationUrl' => $this->verification->url($invoice),
        ])
            // Sous-ensemble de police : seuls les caractères utilisés sont embarqués (PDF léger).
            ->setOption(['isFontSubsettingEnabled' => true, 'defaultFont' => 'DejaVu Sans'])
            ->setPaper('a4');
    }

    public function bytes(Invoice $invoice): string
    {
        return $this->document($invoice)->output();
    }
}
