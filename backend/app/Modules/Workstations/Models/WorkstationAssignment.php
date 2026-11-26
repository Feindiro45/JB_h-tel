<?php

namespace App\Modules\Workstations\Models;

use App\Modules\Identity\Models\User;
use App\Shared\Models\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * Désignation numérotée du poste principal (D-062). Le poste principal courant est celui de la
 * dernière attribution ; le numéro, unique et croissant, permettra de refuser les envois d'un
 * ancien poste (lot 4). Ligne figée : ni modifiée ni supprimée.
 *
 * @property int $id
 * @property string $uuid
 * @property int $number
 * @property int $workstation_id
 * @property int|null $previous_workstation_id
 * @property string $mode FIRST, PLANNED ou FORCED
 * @property string|null $reason
 * @property Carbon|null $previous_last_seen_at
 * @property int $assigned_by
 * @property Carbon $assigned_at
 */
class WorkstationAssignment extends Model
{
    use HasPublicUuid;

    public const FIRST = 'FIRST';

    public const PLANNED = 'PLANNED';

    public const FORCED = 'FORCED';

    public const MODE_LABELS = [
        self::FIRST => 'Première désignation',
        self::PLANNED => 'Transfert planifié',
        self::FORCED => 'Transfert forcé',
    ];

    /** @var list<string> */
    protected $guarded = ['id'];

    /** @var array<string, mixed> */
    protected $attributes = [
        'previous_workstation_id' => null,
        'reason' => null,
        'previous_last_seen_at' => null,
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'number' => 'integer',
            'previous_last_seen_at' => 'datetime',
            'assigned_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Une désignation de poste principal est figée.'));
        static::deleting(fn () => throw new LogicException('Une désignation de poste principal ne peut pas être supprimée.'));
    }

    /** Dernière attribution : celle qui désigne le poste principal courant. */
    public static function current(): ?self
    {
        return self::query()->orderByDesc('number')->first();
    }

    /** @return BelongsTo<Workstation, $this> */
    public function workstation(): BelongsTo
    {
        return $this->belongsTo(Workstation::class);
    }

    /** @return BelongsTo<Workstation, $this> */
    public function previousWorkstation(): BelongsTo
    {
        return $this->belongsTo(Workstation::class, 'previous_workstation_id');
    }

    /** @return BelongsTo<User, $this> */
    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
