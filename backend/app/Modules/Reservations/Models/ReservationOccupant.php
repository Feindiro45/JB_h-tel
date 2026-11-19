<?php

namespace App\Modules\Reservations\Models;

use App\Shared\Models\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $reservation_id
 * @property string $name
 * @property bool $is_primary
 */
class ReservationOccupant extends Model
{
    use HasPublicUuid;

    /** @var list<string> */
    protected $fillable = ['reservation_id', 'name', 'is_primary'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_primary' => 'boolean'];
    }
}
