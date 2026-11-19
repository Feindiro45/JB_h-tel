<?php

namespace App\Shared\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;

/**
 * Identifiant public UUID (docs/DECISIONS.md D-026).
 *
 * La clé primaire entière reste interne : clés étrangères, jointures, audit. Seul l'`uuid`
 * (v7, ordonné dans le temps) apparaît dans les URL, les routes et les réponses de l'API.
 * La liaison de route se fait sur l'`uuid` ; une valeur qui n'est pas un UUID valide donne un 404.
 *
 * @property string $uuid
 */
trait HasPublicUuid
{
    use HasUuids;

    /** @return list<string> */
    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }
}
