<?php

namespace App\Modules\Reservations\Http\Requests;

use App\Modules\Reservations\Domain\Billing\CalendarDayQuantity;
use App\Modules\Reservations\DTO\ModificationData;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/** Correction d'une réservation (D-058) : mêmes règles de saisie qu'à la création, motif obligatoire. */
final class ModifyReservationRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'room_id' => ['required', 'uuid', Rule::exists('rooms', 'uuid')],
            'start_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'end_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'billing_unit' => ['required', Rule::enum(BillingUnit::class)],
            'quantity' => ['required', 'integer', 'min:1', 'max:365'],
            'reason' => [$this->routeIs('*.preview') ? 'nullable' : 'required', 'string', 'max:255'],
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
        }];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'room_id' => 'chambre',
            'start_date' => "date d'arrivée",
            'end_date' => 'date de départ',
            'start_time' => "heure d'arrivée",
            'end_time' => 'heure de départ',
            'billing_unit' => 'forfait',
            'quantity' => 'quantité',
            'reason' => 'motif de la modification',
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'start_date.after_or_equal' => "La date d'arrivée ne peut pas être passée.",
            'end_date.after_or_equal' => "La date de départ doit être identique ou postérieure à la date d'arrivée.",
        ];
    }

    public function toData(): ModificationData
    {
        $room = app(RoomDirectory::class)->findByUuid($this->string('room_id')->toString());

        return new ModificationData(
            roomId: (int) $room?->id,
            startDate: $this->string('start_date')->toString(),
            endDate: $this->string('end_date')->toString(),
            startTime: $this->filled('start_time') ? $this->string('start_time')->toString() : null,
            endTime: $this->filled('end_time') ? $this->string('end_time')->toString() : null,
            billingUnit: $this->enum('billing_unit', BillingUnit::class) ?? BillingUnit::Day,
            quantity: $this->integer('quantity'),
            reason: $this->string('reason')->trim()->toString(),
        );
    }
}
