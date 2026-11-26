<?php

namespace App\Modules\Reservations\Models;

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Domain\Discount;
use App\Modules\Reservations\Domain\DiscountType;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Shared\Models\HasPublicUuid;
use Database\Factories\ReservationFactory;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;

/**
 * Réservation d'une chambre. Le prix est figé à la confirmation et n'est jamais recalculé
 * silencieusement : toute modification de montant (prolongation, confirmation) est explicite et
 * tracée dans l'audit. Une réservation n'est jamais supprimée : elle est annulée.
 *
 * @property int $id
 * @property int $customer_id
 * @property int $room_id
 * @property int|null $rate_id
 * @property Carbon $start_date
 * @property Carbon $end_date
 * @property string|null $start_time
 * @property string|null $end_time
 * @property Carbon $blocked_from
 * @property Carbon $blocked_until
 * @property bool $period_is_estimated
 * @property BillingUnit $billing_unit
 * @property int $quantity
 * @property int $applied_unit_price_fcfa
 * @property int $gross_fcfa
 * @property DiscountType|null $discount_type
 * @property string|null $discount_value
 * @property int $discount_fcfa
 * @property string|null $discount_reason
 * @property int|null $discount_by
 * @property int $net_fcfa
 * @property ReservationStatus $status
 * @property string|null $notes
 * @property Carbon|null $checked_in_at
 * @property int|null $checked_in_by
 * @property Carbon|null $checked_out_at
 * @property int|null $checked_out_by
 * @property Carbon|null $cancelled_at
 * @property int|null $cancelled_by
 * @property string|null $cancellation_reason
 * @property int $created_by
 * @property Carbon|null $created_at
 * @property-read Collection<int, ReservationOccupant> $occupants
 * @property-read User $creator
 */
#[UseFactory(ReservationFactory::class)]
class Reservation extends Model
{
    /** @use HasFactory<ReservationFactory> */
    use HasFactory, HasPublicUuid;

    /** @var list<string> */
    protected $guarded = ['id', 'uuid'];

    /** @var array<string, mixed> */
    protected $attributes = [
        'rate_id' => null, 'start_time' => null, 'end_time' => null, 'period_is_estimated' => false,
        'discount_type' => null, 'discount_value' => null, 'discount_fcfa' => 0, 'discount_reason' => null,
        'discount_by' => null, 'notes' => null, 'checked_in_at' => null, 'checked_in_by' => null,
        'checked_out_at' => null, 'checked_out_by' => null, 'cancelled_at' => null, 'cancelled_by' => null,
        'cancellation_reason' => null,
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'blocked_from' => 'datetime',
            'blocked_until' => 'datetime',
            'period_is_estimated' => 'boolean',
            'billing_unit' => BillingUnit::class,
            'quantity' => 'integer',
            'applied_unit_price_fcfa' => 'integer',
            'gross_fcfa' => 'integer',
            'discount_type' => DiscountType::class,
            'discount_value' => 'decimal:2',
            'discount_fcfa' => 'integer',
            'net_fcfa' => 'integer',
            'status' => ReservationStatus::class,
            'checked_in_at' => 'datetime',
            'checked_out_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    /** @return HasOne<ReservationEvent, $this> Salle de conférence seulement (D-072). */
    public function event(): HasOne
    {
        return $this->hasOne(ReservationEvent::class);
    }

    /** @return HasMany<ReservationOccupant, $this> */
    public function occupants(): HasMany
    {
        return $this->hasMany(ReservationOccupant::class)->orderByDesc('is_primary')->orderBy('id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function blockedPeriod(): BlockedPeriod
    {
        return new BlockedPeriod(
            $this->blocked_from->toImmutable(),
            $this->blocked_until->toImmutable(),
            $this->period_is_estimated,
        );
    }

    public function discount(): ?Discount
    {
        return $this->discount_type === null || $this->discount_value === null
            ? null
            : Discount::fromStored($this->discount_type, $this->discount_value, (string) $this->discount_reason);
    }

    /**
     * Réservations qui bloquent la chambre sur l'intervalle `[from, until[`.
     *
     * @param  Builder<Reservation>  $query
     * @return Builder<Reservation>
     */
    public function scopeBlocking(Builder $query, int $roomId, \DateTimeInterface $from, \DateTimeInterface $until): Builder
    {
        return $query->where('room_id', $roomId)
            ->overlapping($from, $until);
    }

    /**
     * D-056 : après le départ prévu, une occupation sans départ enregistré reste bloquante.
     *
     * @param  Builder<Reservation>  $query
     * @return Builder<Reservation>
     */
    public function scopeOverlapping(Builder $query, \DateTimeInterface $from, \DateTimeInterface $until): Builder
    {
        return $query->whereIn('status', ReservationStatus::blockingValues())
            ->where('blocked_from', '<', $until)
            ->where(fn (Builder $q) => $q->where('blocked_until', '>', $from)
                ->orWhere(fn (Builder $overdue) => $overdue->overdue()));
    }

    /**
     * @param  Builder<Reservation>  $query
     * @return Builder<Reservation>
     */
    public function scopeOverdue(Builder $query, ?\DateTimeInterface $at = null): Builder
    {
        return $query->where('status', ReservationStatus::InProgress->value)
            ->where('blocked_until', '<=', $at ?? now());
    }
}
