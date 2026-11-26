<?php

namespace App\Modules\RoomCatalog\Models;

use App\Modules\RoomCatalog\Contracts\RoomKind;
use App\Shared\Models\HasPublicUuid;
use Database\Factories\RoomTypeFactory;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Type de chambre (VIP, STANDARD) ou salle de conférence (D-072). Le code et la nature sont des
 * références stables : ils ne sont jamais modifiés.
 *
 * @property int $id
 * @property string $code
 * @property string $label
 * @property RoomKind $kind
 * @property string|null $description
 */
#[UseFactory(RoomTypeFactory::class)]
class RoomType extends Model
{
    /** @use HasFactory<RoomTypeFactory> */
    use HasFactory, HasPublicUuid;

    /** @var list<string> */
    protected $fillable = ['code', 'label', 'kind', 'description'];

    /** @var array<string, mixed> */
    protected $attributes = ['kind' => 'ROOM'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['kind' => RoomKind::class];
    }

    /** @return HasMany<Room, $this> */
    public function rooms(): HasMany
    {
        return $this->hasMany(Room::class);
    }

    /** @return HasMany<RoomRate, $this> */
    public function rates(): HasMany
    {
        return $this->hasMany(RoomRate::class);
    }
}
