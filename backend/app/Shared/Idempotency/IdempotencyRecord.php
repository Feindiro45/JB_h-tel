<?php

namespace App\Shared\Idempotency;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Réponse réussie d'une écriture, mémorisée sous sa clé `Idempotency-Key` (lot 3). Ligne
 * technique interne, jamais exposée. Conservée durablement : une sauvegarde hors ligne ancienne
 * doit toujours retrouver son opération, même après expiration d'un cache HTTP (D-067).
 *
 * @property int $id
 * @property int $user_id
 * @property string $idempotency_key
 * @property string $method
 * @property string $path
 * @property string $request_hash
 * @property int $response_status
 * @property string $response_body
 * @property Carbon $created_at
 */
class IdempotencyRecord extends Model
{
    use MassPrunable;

    /** Ancienne durée, conservée pour les outils de compatibilité ; aucune purge automatique. */
    public const RETENTION_DAYS = 30;

    protected $table = 'idempotency_keys';

    /** @var list<string> */
    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['response_status' => 'integer'];
    }

    /** @return Builder<static> */
    public function prunable(): Builder
    {
        return static::query()->whereRaw('1 = 0');
    }
}
