<?php

namespace App\Modules\Reservations\Http\Requests;

use App\Modules\Reservations\DTO\OccupantData;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

final class OccupantsRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'occupants' => ['required', 'array', 'min:1', 'max:50'],
            'occupants.*.name' => ['required', 'string', 'max:160'],
            'occupants.*.is_primary' => ['sometimes', 'boolean'],
        ];
    }

    /** @return list<\Closure> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $occupants = $this->input('occupants');
            if (is_array($occupants) && count(array_filter($occupants, fn ($o) => is_array($o) && filter_var($o['is_primary'] ?? false, FILTER_VALIDATE_BOOL))) > 1) {
                $validator->errors()->add('occupants', 'Un seul occupant peut être désigné comme principal.');
            }
        }];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['occupants' => 'occupants', 'occupants.*.name' => "nom de l'occupant"];
    }

    /** @return list<OccupantData> */
    public function occupants(): array
    {
        return ReservationRequest::occupants((array) $this->input('occupants', []));
    }
}
