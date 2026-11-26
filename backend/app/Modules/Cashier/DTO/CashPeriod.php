<?php

namespace App\Modules\Cashier\DTO;

use Carbon\CarbonImmutable;

/** Période du journal de caisse (début inclus, fin exclue) et agent filtré, écran et export. */
final readonly class CashPeriod
{
    public function __construct(
        public CarbonImmutable $from,
        public CarbonImmutable $until,
        public ?int $agentId = null,
        public ?string $agentName = null,
    ) {}

    /** Dernier jour inclus. */
    public function lastDay(): CarbonImmutable
    {
        return $this->until->subDay();
    }
}
