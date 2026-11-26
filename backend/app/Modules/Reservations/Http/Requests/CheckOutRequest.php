<?php

namespace App\Modules\Reservations\Http\Requests;

use App\Modules\Reservations\DTO\CheckOutData;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Départ (D-071) : `unpaid_reason` n'est exigé que si un solde reste dû ; c'est le service qui le
 * vérifie, sous verrou, avec l'encaissé net du moment.
 */
final class CheckOutRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'unpaid_reason' => ['nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['unpaid_reason' => 'motif du départ avec solde impayé'];
    }

    public function toData(): CheckOutData
    {
        $reason = $this->string('unpaid_reason')->trim()->toString();

        return new CheckOutData(unpaidReason: $reason !== '' ? $reason : null);
    }
}
