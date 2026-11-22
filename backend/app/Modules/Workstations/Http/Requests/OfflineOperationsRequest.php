<?php

namespace App\Modules\Workstations\Http\Requests;

use App\Modules\Workstations\DTO\OfflineOperationFilters;
use App\Modules\Workstations\Models\OfflineOperation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Filtres du centre de synchronisation (écran « Mode hors ligne » et export Excel). */
final class OfflineOperationsRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'outcome' => ['nullable', Rule::in(array_keys(OfflineOperation::OUTCOME_LABELS))],
            'review' => ['nullable', Rule::in(array_keys(OfflineOperation::REVIEW_LABELS))],
            'search' => ['nullable', 'string', 'max:160'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['outcome' => 'résultat', 'review' => 'examen', 'search' => 'recherche'];
    }

    public function toData(): OfflineOperationFilters
    {
        $text = fn (string $key) => $this->filled($key) ? $this->string($key)->trim()->toString() : null;

        return new OfflineOperationFilters($text('outcome'), $text('review'), $text('search'));
    }
}
