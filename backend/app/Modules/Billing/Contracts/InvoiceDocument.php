<?php

namespace App\Modules\Billing\Contracts;

use Closure;

/**
 * Facture ou avoir prêt à être envoyé (notifications) : informations clés et PDF A4.
 * Le PDF n'est produit qu'à la demande (`pdf()`) : le rendu dompdf prend plusieurs secondes et
 * n'est utile que si un e-mail part réellement (client joignable par e-mail).
 */
final readonly class InvoiceDocument
{
    /** @param  Closure(): string  $renderPdf */
    public function __construct(
        public int $reservationId,
        public bool $isCreditNote,
        public string $typeLabel,
        public string $number,
        public int $netFcfa,
        public ?string $creditedNumber,
        public string $verificationUrl,
        private Closure $renderPdf,
    ) {}

    public function pdf(): string
    {
        return ($this->renderPdf)();
    }
}
