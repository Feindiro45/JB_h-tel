<?php

namespace App\Modules\Reporting\DTO;

use Carbon\CarbonImmutable;

/** Filtres du journal d'audit, partagés par l'écran et l'export Excel. */
final readonly class AuditFilters
{
    public function __construct(
        /** Domaine (préfixe de l'action : `reservation`, `payment`…). */
        public ?string $domain = null,
        public ?int $actorId = null,
        public ?string $actorName = null,
        public ?CarbonImmutable $from = null,
        /** Avant ce moment (exclu) : lendemain du dernier jour. */
        public ?CarbonImmutable $until = null,
    ) {}
}
