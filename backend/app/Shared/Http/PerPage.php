<?php

namespace App\Shared\Http;

use Illuminate\Http\Request;

/** Nombre de lignes par page des listes (`per_page`) : 10, 25, 50 ou 100 ; 25 par défaut. */
final class PerPage
{
    public const ALLOWED = [10, 25, 50, 100];

    public const DEFAULT = 25;

    public static function from(Request $request, int $default = self::DEFAULT): int
    {
        $value = $request->integer('per_page', $default);

        return in_array($value, self::ALLOWED, true) ? $value : $default;
    }
}
