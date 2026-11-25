<?php

namespace App\Modules\Reservations\Http\Requests;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Reservations\Domain\Billing\CalendarDayQuantity;
use App\Modules\Reservations\Domain\Discount;
use App\Modules\Reservations\Domain\DiscountType;
use App\Modules\Reservations\DTO\OccupantData;
use App\Modules\Reservations\DTO\ReservationRequestData;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Shared\Offline\OfflineReplay;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Création d'une réservation (`POST /reservations`) et devis (`POST /reservations/quote`, client
 * facultatif). Validation de confort côté React, **autorité ici** (règles validées). Les chambres
 * et les clients sont référencés par UUID (D-026).
 */
class ReservationRequest extends FormRequest
{
    protected function customerRequired(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'room_id' => ['required', 'uuid', Rule::exists('rooms', 'uuid')],
            'customer_id' => [$this->customerRequired() ? 'required' : 'nullable', 'uuid', Rule::exists('customers', 'uuid')],
            // Une coupure peut durer plusieurs jours : autoriser la période du rejeu borné,
            // sans utiliser l'heure du poste comme autorisation d'un ancien tarif (D-067).
            'start_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.(OfflineReplay::fromRequest($this)?->pricedAt()?->toDateString() ?? 'today')],
            'end_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'billing_unit' => ['required', Rule::enum(BillingUnit::class)],
            'quantity' => ['required', 'integer', 'min:1', 'max:365'],
            'occupants' => ['required', 'array', 'min:1', 'max:50'],
            'occupants.*.name' => ['required', 'string', 'max:160'],
            'occupants.*.is_primary' => ['sometimes', 'boolean'],
            'discount' => ['nullable', 'array'],
            'discount.type' => ['required_with:discount', Rule::enum(DiscountType::class)],
            'discount.value' => ['required_with:discount', 'numeric', 'gt:0', $this->discountValueRule()],
            'discount.reason' => ['required_with:discount', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'confirm' => ['sometimes', 'boolean'],
            'expected_unit_price_fcfa' => ['sometimes', 'integer', 'min:0'],
        ];
    }

    /** @return list<Closure> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($this->input('billing_unit') === BillingUnit::Day->value
                && ! $validator->errors()->hasAny(['start_date', 'end_date', 'quantity'])) {
                $quantity = CalendarDayQuantity::forStay($this->string('start_date')->toString(), $this->string('end_date')->toString());
                if ($this->integer('quantity') !== $quantity) {
                    $validator->errors()->add('quantity', "Le nombre de jours calculé entre les dates est de {$quantity} (une journée minimum).");
                }
            }

            $occupants = $this->input('occupants');
            if (is_array($occupants) && count(array_filter($occupants, fn ($o) => is_array($o) && filter_var($o['is_primary'] ?? false, FILTER_VALIDATE_BOOL))) > 1) {
                $validator->errors()->add('occupants', 'Un seul occupant peut être désigné comme principal.');
            }
        }];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'room_id' => 'chambre',
            'customer_id' => 'client',
            'start_date' => "date d'arrivée",
            'end_date' => 'date de départ',
            'start_time' => "heure d'arrivée",
            'end_time' => 'heure de départ',
            'billing_unit' => 'unité de facturation',
            'quantity' => 'quantité',
            'occupants' => 'occupants',
            'occupants.*.name' => "nom de l'occupant",
            'discount.type' => 'type de réduction',
            'discount.value' => 'valeur de la réduction',
            'discount.reason' => 'motif de la réduction',
            'notes' => 'notes',
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'start_date.after_or_equal' => "La date d'arrivée ne peut pas être passée.",
            'end_date.after_or_equal' => "La date de départ doit être identique ou postérieure à la date d'arrivée.",
            'occupants.required' => 'Indiquez au moins un occupant.',
            'occupants.min' => 'Indiquez au moins un occupant.',
        ];
    }

    public function toData(): ReservationRequestData
    {
        $room = app(RoomDirectory::class)->findByUuid($this->string('room_id')->toString());
        $customer = $this->filled('customer_id')
            ? app(CustomerDirectory::class)->findByUuid($this->string('customer_id')->toString())
            : null;

        return new ReservationRequestData(
            roomId: (int) $room?->id,
            customerId: $customer?->id,
            startDate: $this->string('start_date')->toString(),
            endDate: $this->string('end_date')->toString(),
            startTime: $this->filled('start_time') ? $this->string('start_time')->toString() : null,
            endTime: $this->filled('end_time') ? $this->string('end_time')->toString() : null,
            billingUnit: $this->enum('billing_unit', BillingUnit::class) ?? BillingUnit::Day,
            quantity: $this->integer('quantity'),
            occupants: self::occupants((array) $this->input('occupants', [])),
            discount: $this->discount(),
            notes: $this->filled('notes') ? $this->string('notes')->trim()->toString() : null,
            confirm: $this->boolean('confirm', true),
            pricedAt: OfflineReplay::fromRequest($this)?->pricedAt(),
            expectedUnitPriceFcfa: $this->has('expected_unit_price_fcfa') ? $this->integer('expected_unit_price_fcfa') : null,
        );
    }

    /**
     * @param  array<int|string, mixed>  $occupants
     * @return list<OccupantData>
     */
    public static function occupants(array $occupants): array
    {
        return array_values(array_map(fn ($o) => new OccupantData(
            trim((string) ($o['name'] ?? '')),
            filter_var($o['is_primary'] ?? false, FILTER_VALIDATE_BOOL),
        ), array_filter($occupants, 'is_array')));
    }

    private function discount(): ?Discount
    {
        if (! $this->filled('discount.type')) {
            return null;
        }
        $reason = $this->string('discount.reason')->trim()->toString();
        $value = (string) $this->input('discount.value');

        return $this->input('discount.type') === DiscountType::Percent->value
            ? Discount::percent($value, $reason)
            : Discount::fixed((int) $value, $reason);
    }

    private function discountValueRule(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            $type = $this->input('discount.type');
            $text = is_scalar($value) ? (string) $value : '';
            if ($type === DiscountType::Percent->value && (! preg_match('/^\d{1,3}([.,]\d{1,2})?$/', $text) || (float) str_replace(',', '.', $text) > 100)) {
                $fail('La réduction en pourcentage doit être comprise entre 0,01 et 100, avec au plus deux décimales.');
            }
            if ($type === DiscountType::Fixed->value && ! preg_match('/^\d+$/', $text)) {
                $fail('La réduction en montant fixe doit être un nombre entier de FCFA.');
            }
        };
    }
}
