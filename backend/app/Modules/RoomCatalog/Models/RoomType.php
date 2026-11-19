<?php

namespace App\Modules\RoomCatalog\Models;

use App\Shared\Models\HasPublicUuid;
use Database\Factories\RoomTypeFactory;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Type de chambre (VIP, STANDARD). Le code est une référence stable : il n'est jamais modifié.
 *
 * @property int $id
 * @property string $code
 * @property string $label
 * @property string|null $description
 */
#[UseFactory(RoomTypeFactory::class)]
class RoomType extends Model
{
    /** @use HasFactory<RoomTypeFactory> */
    use HasFactory, HasPublicUuid;

    /** @var list<string> */
    protected $fillable = ['code', 'label', 'description'];

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
