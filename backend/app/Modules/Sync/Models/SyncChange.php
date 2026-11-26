<?php

namespace App\Modules\Sync\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Ligne du journal des changements (D-069). Gardée `jbhotel.sync.retention_days` jours (un poste
 * peut rester longtemps hors ligne) ; au-delà, un curseur trop ancien demande un rechargement.
 *
 * @property int $id
 * @property string $entity
 * @property string|null $entity_uuid
 * @property string $action
 * @property Carbon $occurred_at
 */
class SyncChange extends Model
{
    use MassPrunable;

    public $timestamps = false;

    /** @var list<string> */
    protected $guarded = ['id'];

    /** @var array<string, mixed> */
    protected $attributes = ['entity_uuid' => null];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['occurred_at' => 'datetime'];
    }

    /** @return Builder<static> */
    public function prunable(): Builder
    {
        return static::query()->where('occurred_at', '<', now()->subDays((int) config('jbhotel.sync.retention_days', 365)));
    }
}
