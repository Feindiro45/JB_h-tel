<?php

namespace App\Modules\Reservations\Domain\Billing;

use DateTimeImmutable;

/** D-055 : jours civils entre deux dates validées, indépendamment des heures et du fuseau. */
final class CalendarDayQuantity
{
    public static function between(string $from, string $to): int
    {
        $start = new DateTimeImmutable($from.'T00:00:00+00:00');
        $end = new DateTimeImmutable($to.'T00:00:00+00:00');

        return (int) $start->diff($end)->format('%r%a');
    }

    public static function forStay(string $from, string $to): int
    {
        return max(1, self::between($from, $to));
    }
}
