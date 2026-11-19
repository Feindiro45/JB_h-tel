<?php

namespace App\Modules\Reservations\Domain;

use App\Shared\Support\Format;
use Carbon\CarbonImmutable;

/**
 * Intervalle réellement bloqué pour une chambre, `[from, until[`.
 *
 * Politique conservatrice des heures manquantes (D-009, provisoire, Q-02 et Q-03) : sans heure
 * d'arrivée, la chambre est bloquée dès 00:00 du jour d'arrivée ; sans heure de départ, jusqu'à la
 * fin (24:00) du jour de départ. La période est alors dite « déduite » (`estimated`).
 */
final readonly class BlockedPeriod
{
    public function __construct(
        public CarbonImmutable $from,
        public CarbonImmutable $until,
        public bool $estimated,
    ) {}

    public static function fromStay(string $startDate, string $endDate, ?string $startTime, ?string $endTime): self
    {
        $timezone = (string) config('app.timezone');
        $from = CarbonImmutable::parse($startDate.' '.($startTime ?? '00:00'), $timezone);
        $until = $endTime === null
            ? CarbonImmutable::parse($endDate, $timezone)->startOfDay()->addDay()
            : CarbonImmutable::parse($endDate.' '.$endTime, $timezone);

        return new self($from, $until, $startTime === null || $endTime === null);
    }

    public function isValid(): bool
    {
        return $this->until->gt($this->from);
    }

    public function minutes(): int
    {
        return (int) $this->from->diffInMinutes($this->until);
    }

    public function overlaps(CarbonImmutable $from, CarbonImmutable $until): bool
    {
        return $this->from->lt($until) && $from->lt($this->until);
    }

    public function describe(): string
    {
        return 'du '.Format::dateTime($this->from).' au '.Format::dateTime($this->until);
    }
}
