<?php

namespace App\Modules\Billing\Contracts;

/** Facture ou avoir prêt à être envoyé (notifications) : informations clés et PDF A4. */
final readonly class InvoiceDocument
{
    public function __construct(
        public int $reservationId,
        public bool $isCreditNote,
        public string $typeLabel,
        public string $number,
        public int $netFcfa,
        public ?string $creditedNumber,
        public string $verificationUrl,
        public string $pdf,
    ) {}
}
