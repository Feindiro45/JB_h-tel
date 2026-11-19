<?php

namespace App\Modules\RoomCatalog\Models;

use App\Modules\RoomCatalog\Domain\MaintenanceStatus;
use App\Shared\Models\HasPublicUuid;
use Database\Factories\RoomFactory;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Chambre individuelle. L'occupation n'est pas stockée ici : elle est calculée à partir des
 * réservations (fiche 06).
 *
 * @property int $id
 * @property string $number
 * @property int $room_type_id
 * @property int $capacity
 * @property MaintenanceStatus $maintenance_status
 * @property string|null $maintenance_note
 * @property string|null $notes
 * @property-read RoomType $roomType
 */
#[UseFactory(RoomFactory::class)]
class Room extends Model
{
    /** @use HasFactory<RoomFactory> */
    use HasFactory, HasPublicUuid;

    /** @var list<string> */
    protected $fillable = ['number', 'room_type_id', 'capacity', 'maintenance_status', 'maintenance_note', 'notes'];

    /** @var array<string, mixed> */
    protected $attributes = ['maintenance_status' => 'AVAILABLE'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'capacity' => 'integer',
            'maintenance_status' => MaintenanceStatus::class,
        ];
    }

    /** @return BelongsTo<RoomType, $this> */
    public function roomType(): BelongsTo
    {
        return $this->belongsTo(RoomType::class);
    }

    public function isUnderMaintenance(): bool
    {
        return $this->maintenance_status === MaintenanceStatus::Maintenance;
    }

    /**
     * Tri naturel des numéros : 9 avant 10, 001 avant 002 avant 101.
     *
     * @param  Builder<Room>  $query
     * @return Builder<Room>
     */
    public function scopeOrderByNumber(Builder $query): Builder
    {
        return $query->orderByRaw('LENGTH(number)')->orderBy('number');
    }
}
