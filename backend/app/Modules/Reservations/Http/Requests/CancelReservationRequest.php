<?php

namespace App\Modules\Reservations\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class CancelReservationRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['reason' => ['required', 'string', 'max:255']];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['reason' => "motif d'annulation"];
    }

    public function reason(): string
    {
        return $this->string('reason')->trim()->toString();
    }
}
