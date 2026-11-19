<?php

namespace App\Modules\Cashier\Models;

use App\Modules\Identity\Models\User;
use App\Shared\Models\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Remboursement d'un paiement : ligne distincte, jamais modifiée ni supprimée.
 *
 * @property int $id
 * @property int $payment_id
 * @property int $amount_fcfa
 * @property string|null $method
 * @property string $reason
 * @property int $processed_by
 * @property Carbon $processed_at
 * @property-read User $processor
 * @property-read Payment $payment
 */
class Refund extends Model
{
    use HasPublicUuid;

    /** @var list<string> */
    protected $guarded = ['id', 'uuid'];

    /** @var array<string, mixed> */
    protected $attributes = ['method' => null];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['amount_fcfa' => 'integer', 'processed_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    /** @return BelongsTo<Payment, $this> */
    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
