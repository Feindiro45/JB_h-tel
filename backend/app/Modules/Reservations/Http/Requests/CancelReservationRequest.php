<?php

namespace App\Modules\Reservations\Http\Requests;

use App\Modules\Reservations\Contracts\CancellationRefunds;
use App\Modules\Reservations\DTO\CancellationData;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Annulation : motif obligatoire ; `refund_fcfa` confirme le remboursement de l'encaissé net
 * (0 ou absent si rien n'a été encaissé), `refund_method` vide = même moyen que chaque versement.
 */
final class CancelReservationRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:255'],
            'refund_fcfa' => ['nullable', 'integer', 'min:0'],
            'refund_method' => ['nullable', 'string', Rule::in(app(CancellationRefunds::class)->acceptedMethods())],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'reason' => "motif d'annulation",
            'refund_fcfa' => 'montant à rembourser',
            'refund_method' => 'moyen de remboursement',
        ];
    }

    public function toData(): CancellationData
    {
        return new CancellationData(
            reason: $this->string('reason')->trim()->toString(),
            refundFcfa: $this->integer('refund_fcfa'),
            refundMethod: $this->filled('refund_method') ? $this->string('refund_method')->toString() : null,
        );
    }
}
