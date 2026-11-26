<?php

namespace App\Shared\Export;

use Illuminate\Contracts\Auth\Authenticatable;

/** Mentions du bandeau d'un export : filtres appliqués, date et auteur de l'export. */
final class ExportContext
{
    /**
     * @param  array<string, string|null>  $filters  libellé => valeur lisible (vide : ignoré)
     * @return list<string>
     */
    public static function of(?Authenticatable $user, array $filters = []): array
    {
        $lines = [];
        foreach ($filters as $label => $value) {
            if ($value !== null && trim($value) !== '') {
                $lines[] = "{$label} : {$value}";
            }
        }
        if ($lines === []) {
            $lines[] = 'Sans filtre';
        }
        $name = $user !== null && isset($user->name) && is_string($user->name) ? $user->name : null;
        $lines[] = 'Exporté le '.now()->format('d/m/Y à H:i').($name !== null ? " par {$name}" : '');

        return $lines;
    }

    /** « 2026-12-01 » → « 01/12/2026 ». */
    public static function date(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $parts = explode('-', $value);

        return count($parts) === 3 ? "{$parts[2]}/{$parts[1]}/{$parts[0]}" : $value;
    }
}
