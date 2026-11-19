<?php

namespace App\Modules\Reservations\Http\Requests;

use App\Modules\Reservations\DTO\ExtensionData;
use Illuminate\Foundation\Http\FormRequest;

final class ExtendReservationRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'end_date' => ['required', 'date_format:Y-m-d'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'additional_quantity' => ['required', 'integer', 'min:0', 'max:365'],
            'confirm' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'end_date' => 'nouvelle date de départ',
            'end_time' => 'nouvelle heure de départ',
            'additional_quantity' => 'quantité ajoutée',
        ];
    }

    public function toData(): ExtensionData
    {
        return new ExtensionData(
            endDate: $this->string('end_date')->toString(),
            endTime: $this->filled('end_time') ? $this->string('end_time')->toString() : null,
            additionalQuantity: $this->integer('additional_quantity'),
            confirmed: $this->boolean('confirm'),
        );
    }
}
