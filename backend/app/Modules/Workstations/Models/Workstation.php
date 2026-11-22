<?php

namespace App\Modules\Workstations\Models;

use App\Modules\Identity\Models\User;
use App\Shared\Models\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Poste de caisse (D-062) : un navigateur enregistré, identifié par un jeton secret dont seule
 * l'empreinte SHA-256 est conservée. Jamais supprimé : un poste retiré est révoqué.
 *
 * @property int $id
 * @property string $uuid
 * @property string $name
 * @property string $token_hash
 * @property string|null $user_agent
 * @property int $registered_by
 * @property Carbon|null $last_seen_at
 * @property int|null $last_seen_by
 * @property Carbon|null $revoked_at
 * @property int|null $revoked_by
 * @property string|null $revocation_reason
 * @property int $pending_operations
 * @property int $rejected_operations
 * @property Carbon|null $oldest_pending_at
 * @property Carbon|null $last_sync_at
 * @property string|null $last_sync_status
 * @property Carbon|null $last_backup_at
 * @property bool|null $storage_persisted
 * @property Carbon|null $reported_at
 * @property Carbon $created_at
 */
class Workstation extends Model
{
    use HasPublicUuid;

    /** En-tête HTTP qui porte le jeton du poste à chaque appel de l'API. */
    public const HEADER = 'X-Workstation-Token';

    /** @var list<string> */
    protected $guarded = ['id'];

    /** @var list<string> */
    protected $hidden = ['token_hash'];

    /** @var array<string, mixed> */
    protected $attributes = [
        'user_agent' => null,
        'last_seen_at' => null,
        'last_seen_by' => null,
        'revoked_at' => null,
        'revoked_by' => null,
        'revocation_reason' => null,
        'pending_operations' => 0,
        'rejected_operations' => 0,
        'oldest_pending_at' => null,
        'last_sync_at' => null,
        'last_sync_status' => null,
        'last_backup_at' => null,
        'storage_persisted' => null,
        'reported_at' => null,
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'revoked_at' => 'datetime',
            'pending_operations' => 'integer',
            'rejected_operations' => 'integer',
            'oldest_pending_at' => 'datetime',
            'last_sync_at' => 'datetime',
            'last_backup_at' => 'datetime',
            'storage_persisted' => 'boolean',
            'reported_at' => 'datetime',
        ];
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function findByToken(?string $token): ?self
    {
        if ($token === null || trim($token) === '' || strlen($token) > 200) {
            return null;
        }

        return self::query()->where('token_hash', self::hashToken($token))->first();
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    /** @return BelongsTo<User, $this> */
    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    /** @return BelongsTo<User, $this> */
    public function lastSeenBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_seen_by');
    }
}
