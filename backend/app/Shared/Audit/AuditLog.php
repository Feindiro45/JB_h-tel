<?php

namespace App\Shared\Audit;

use App\Modules\Identity\Models\User;
use App\Shared\Models\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * Entrée du journal d'audit. Append-only : toute modification ou suppression est refusée.
 *
 * @property int $id
 * @property int|null $actor_id
 * @property string $action
 * @property string $entity_type
 * @property int $entity_id
 * @property array<string, mixed>|null $before_json
 * @property array<string, mixed>|null $after_json
 * @property string|null $ip_address
 * @property Carbon $occurred_at
 */
class AuditLog extends Model
{
    use HasPublicUuid;

    public $timestamps = false;

    /** @var list<string> */
    protected $fillable = [
        'actor_id',
        'action',
        'entity_type',
        'entity_id',
        'before_json',
        'after_json',
        'ip_address',
        'occurred_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'before_json' => 'array',
            'after_json' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException("Le journal d'audit ne peut pas être modifié."));
        static::deleting(fn () => throw new LogicException("Le journal d'audit ne peut pas être supprimé."));
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
