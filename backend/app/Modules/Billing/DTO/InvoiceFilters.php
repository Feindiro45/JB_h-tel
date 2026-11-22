<?php

namespace App\Modules\Billing\DTO;

use App\Modules\Billing\Domain\InvoiceStatus;
use App\Modules\Billing\Domain\InvoiceType;
use Carbon\CarbonImmutable;

/** Filtres de l'écran « Factures et reçus », partagés par la liste et l'export Excel. */
final readonly class InvoiceFilters
{
    public function __construct(
        public ?InvoiceType $type = null,
        public ?InvoiceStatus $status = null,
        /** Émis à partir de ce jour (inclus). */
        public ?CarbonImmutable $from = null,
        /** Émis avant ce moment (exclu) : lendemain du dernier jour. */
        public ?CarbonImmutable $until = null,
        /** Numéro du document ou nom du client figé dans l'instantané. */
        public ?string $search = null,
    ) {}
}
