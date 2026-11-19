<?php

namespace App\Modules\RoomCatalog\Http\Requests;

use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\DTO\PublishRateData;
use App\Modules\RoomCatalog\Models\RoomType;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Publication d'une version tarifaire. Montant entier en FCFA ; motif obligatoire
 * (historique : ancien tarif, nouveau tarif, auteur, date d'effet, motif).
 */
final class PublishRateRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'room_type_id' => ['required', 'uuid', Rule::exists('room_types', 'uuid')],
            'billing_unit' => ['required', Rule::enum(BillingUnit::class)],
            'amount_fcfa' => ['required', 'integer', 'min:0', 'max:1000000000'],
            'effective_from' => ['nullable', 'date'],
            'reason' => ['required', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'room_type_id' => 'type de chambre',
            'billing_unit' => 'unité de facturation',
            'amount_fcfa' => 'montant',
            'effective_from' => "date d'effet",
            'reason' => 'motif',
        ];
    }

    public function toData(): PublishRateData
    {
        return new PublishRateData(
            roomTypeId: (int) RoomType::query()->where('uuid', $this->string('room_type_id')->toString())->value('id'),
            billingUnit: $this->enum('billing_unit', BillingUnit::class) ?? BillingUnit::Day,
            amountFcfa: $this->integer('amount_fcfa'),
            reason: $this->string('reason')->trim()->toString(),
            effectiveFrom: $this->filled('effective_from')
                ? CarbonImmutable::parse($this->string('effective_from')->toString(), config('app.timezone'))
                : null,
        );
    }
}
