<?php

namespace App\Modules\RoomCatalog\Models;

use App\Modules\Identity\Models\User;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Domain\RateStatus;
use App\Shared\Models\HasPublicUuid;
use Carbon\CarbonInterface;
use Database\Factories\RoomRateFactory;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Version tarifaire. Le montant n'est **jamais** modifié : une nouvelle version est publiée et la
 * précédente reçoit une date de fin. Les versions d'un même couple (type, unité) se suivent
 * sans trou ni chevauchement.
 *
 * @property int $id
 * @property int $room_type_id
 * @property BillingUnit $billing_unit
 * @property int $amount_fcfa
 * @property Carbon $effective_from
 * @property Carbon|null $effective_to
 * @property string|null $reason
 * @property int|null $created_by
 * @property-read RoomType $roomType
 * @property-read User|null $creator
 */
#[UseFactory(RoomRateFactory::class)]
class RoomRate extends Model
{
    /** @use HasFactory<RoomRateFactory> */
    use HasFactory, HasPublicUuid;

    /** @var list<string> */
    protected $fillable = ['room_type_id', 'billing_unit', 'amount_fcfa', 'effective_from', 'effective_to', 'reason', 'created_by'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'billing_unit' => BillingUnit::class,
            'amount_fcfa' => 'integer',
            'effective_from' => 'datetime',
            'effective_to' => 'datetime',
        ];
    }

    /** @return BelongsTo<RoomType, $this> */
    public function roomType(): BelongsTo
    {
        return $this->belongsTo(RoomType::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function statusAt(CarbonInterface $at): RateStatus
    {
        if ($this->effective_from->gt($at)) {
            return RateStatus::Scheduled;
        }

        return $this->effective_to === null || $this->effective_to->gt($at) ? RateStatus::Active : RateStatus::Expired;
    }

    /**
     * @param  Builder<RoomRate>  $query
     * @return Builder<RoomRate>
     */
    public function scopeActiveAt(Builder $query, CarbonInterface $at): Builder
    {
        return $query->where('effective_from', '<=', $at)
            ->where(fn (Builder $q) => $q->whereNull('effective_to')->orWhere('effective_to', '>', $at));
    }

    /**
     * @param  Builder<RoomRate>  $query
     * @return Builder<RoomRate>
     */
    public function scopeForChain(Builder $query, int $roomTypeId, BillingUnit $unit): Builder
    {
        return $query->where('room_type_id', $roomTypeId)->where('billing_unit', $unit->value);
    }
}
