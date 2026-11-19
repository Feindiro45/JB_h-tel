<?php

namespace App\Modules\Billing\Models;

use App\Modules\Billing\Domain\InvoiceStatus;
use App\Modules\Billing\Domain\InvoiceType;
use App\Shared\Models\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * Facture ou avoir. **Figée dès l'émission** (cahier des charges) : l'instantané, les montants et
 * le numéro ne changent plus jamais, et le document n'est jamais supprimé. Seule évolution
 * permise : une facture émise passe à « annulée par avoir » lorsqu'un avoir la crédite.
 *
 * @property int $id
 * @property int $reservation_id
 * @property InvoiceType $type
 * @property int|null $credited_invoice_id
 * @property string $invoice_number
 * @property string $verification_code
 * @property Carbon $issued_at
 * @property int $issued_by
 * @property int $gross_fcfa
 * @property int $discount_fcfa
 * @property int $net_fcfa
 * @property array<string, mixed> $snapshot_json
 * @property InvoiceStatus $status
 * @property-read Invoice|null $creditedInvoice
 */
class Invoice extends Model
{
    use HasPublicUuid;

    /** @var list<string> */
    protected $guarded = ['id', 'uuid'];

    /** Le code de vérification n'apparaît que dans le QR code imprimé (D-036). */
    /** @var list<string> */
    protected $hidden = ['verification_code'];

    /** @var array<string, mixed> */
    protected $attributes = ['credited_invoice_id' => null, 'status' => 'ISSUED', 'type' => 'INVOICE'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'type' => InvoiceType::class,
            'status' => InvoiceStatus::class,
            'issued_at' => 'datetime',
            'gross_fcfa' => 'integer',
            'discount_fcfa' => 'integer',
            'net_fcfa' => 'integer',
            'snapshot_json' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (Invoice $invoice): void {
            $changed = array_keys(array_diff_key($invoice->getDirty(), array_flip(['updated_at'])));
            $creditedOnly = $changed === ['status']
                && $invoice->getOriginal('status') === InvoiceStatus::Issued
                && $invoice->status === InvoiceStatus::Credited;
            if (! $creditedOnly) {
                throw new LogicException('Une facture émise est figée : elle ne peut pas être modifiée.');
            }
        });
        static::deleting(fn () => throw new LogicException('Une facture émise ne peut pas être supprimée.'));
    }

    /** @return BelongsTo<Invoice, $this> */
    public function creditedInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'credited_invoice_id');
    }
}
