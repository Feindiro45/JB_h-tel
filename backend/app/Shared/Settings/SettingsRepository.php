<?php

namespace App\Shared\Settings;

use Illuminate\Support\Facades\DB;

/**
 * Lecture des paramètres modifiables par l'administrateur (table `settings`, valeurs JSON).
 * Les valeurs par défaut et leur statut (validé ou provisoire) sont dans SettingsSeeder.
 * Cache limité à la requête : un changement est pris en compte à la requête suivante.
 */
final class SettingsRepository
{
    /** @var array<string, mixed>|null */
    private ?array $cache = null;

    public function get(string $key, mixed $default = null): mixed
    {
        $this->cache ??= DB::table('settings')->pluck('value', 'key')
            ->map(fn ($value) => json_decode((string) $value, true))
            ->all();

        return array_key_exists($key, $this->cache) ? $this->cache[$key] : $default;
    }

    /** Oublie les valeurs lues : à appeler après une modification, pour la suite de la requête. */
    public function refresh(): void
    {
        $this->cache = null;
    }

    public function int(string $key, int $default): int
    {
        $value = $this->get($key, $default);

        return is_numeric($value) ? (int) $value : $default;
    }

    public function string(string $key, string $default): string
    {
        $value = $this->get($key, $default);

        return is_string($value) ? $value : $default;
    }
}
