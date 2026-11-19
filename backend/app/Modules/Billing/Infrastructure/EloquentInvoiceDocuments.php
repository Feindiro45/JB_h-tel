<?php

namespace App\Modules\Billing\Infrastructure;

use App\Modules\Billing\Application\InvoicePdfRenderer;
use App\Modules\Billing\Application\InvoiceVerification;
use App\Modules\Billing\Contracts\InvoiceDocument;
use App\Modules\Billing\Contracts\InvoiceDocuments;
use App\Modules\Billing\Domain\InvoiceType;
use App\Modules\Billing\Models\Invoice;

final class EloquentInvoiceDocuments implements InvoiceDocuments
{
    public function __construct(
        private readonly InvoicePdfRenderer $renderer,
        private readonly InvoiceVerification $verification,
    ) {}

    public function find(int $invoiceId): ?InvoiceDocument
    {
        $invoice = Invoice::query()->with('creditedInvoice')->find($invoiceId);
        if ($invoice === null) {
            return null;
        }

        return new InvoiceDocument(
            reservationId: $invoice->reservation_id,
            isCreditNote: $invoice->type === InvoiceType::CreditNote,
            typeLabel: $invoice->type->label(),
            number: $invoice->invoice_number,
            netFcfa: $invoice->net_fcfa,
            creditedNumber: $invoice->creditedInvoice?->invoice_number,
            verificationUrl: $this->verification->url($invoice),
            pdf: $this->renderer->bytes($invoice),
        );
    }
}
