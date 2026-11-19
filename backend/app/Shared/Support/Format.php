<?php

namespace App\Shared\Support;

use Carbon\CarbonInterface;

/** Formats français pour les messages destinés aux utilisateurs. */
final class Format
{
    /** 50000 → « 50 000 FCFA » (montants entiers, D-008). */
    public static function fcfa(int $amount): string
    {
        return number_format($amount, 0, ',', ' ').' FCFA';
    }

    /** « 01/12/2026 14:00 » dans le fuseau de l'hôtel. */
    public static function dateTime(CarbonInterface $at): string
    {
        return $at->copy()->setTimezone((string) config('app.timezone'))->format('d/m/Y H:i');
    }
}
