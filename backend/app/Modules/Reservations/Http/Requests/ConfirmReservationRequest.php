<?php

namespace App\Modules\Reservations\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class ConfirmReservationRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['expected_unit_price_fcfa' => ['sometimes', 'integer', 'min:0']];
    }
}
