<?php

namespace App\Modules\Cashier\Models;

use App\Modules\Cashier\Domain\PaymentStatus;
use App\Modules\Identity\Models\User;
use App\Shared\Models\HasPublicUuid;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Encaissement. Jamais supprimé : il est annulé (statut, auteur, motif). Un remboursement est
 * une ligne distincte ; le paiement initial reste intact.
 *
 * @property int $id
 * @property int $reservation_id
 * @property string $receipt_number
 * @property int $amount_fcfa
 * @property string $method
 * @property Carbon $received_at
 * @property int $cashier_id
 * @property PaymentStatus $status
 * @property string|null $reference
 * @property Carbon|null $cancelled_at
 * @property int|null $cancelled_by
 * @property string|null $cancellation_reason
 * @property-read Collection<int, Refund> $refunds
 * @property-read User $cashier
 */
class Payment extends Model
{
    use HasPublicUuid;

    /** @var list<string> */
    protected $guarded = ['id', 'uuid'];

    /** @var array<string, mixed> */
    protected $attributes = [
        'status' => 'VALID', 'reference' => null, 'cancelled_at' => null, 'cancelled_by' => null, 'cancellation_reason' => null,
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'amount_fcfa' => 'integer',
            'received_at' => 'datetime',
            'status' => PaymentStatus::class,
            'cancelled_at' => 'datetime',
        ];
    }

    /** @return HasMany<Refund, $this> */
    public function refunds(): HasMany
    {
        return $this->hasMany(Refund::class)->orderBy('id');
    }

    /** @return BelongsTo<User, $this> */
    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_id');
    }

    public function refundedFcfa(): int
    {
        return (int) $this->refunds->sum('amount_fcfa');
    }
}
