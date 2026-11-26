<?php

namespace App\Modules\Sync\Http\Requests;

use App\Modules\Sync\Application\Queries\ChangeFeed;
use App\Modules\Sync\DTO\ChangeFeedFilters;
use Illuminate\Foundation\Http\FormRequest;

final class ChangeFeedRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'cursor' => ['nullable', 'string', 'regex:/^v1\.\d{1,18}$/'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['cursor.regex' => 'Le curseur de synchronisation est invalide : rechargez les données du poste.'];
    }

    public function toData(): ChangeFeedFilters
    {
        $cursor = $this->validated('cursor');
        $limit = $this->validated('limit');

        return new ChangeFeedFilters(
            ChangeFeed::decode(is_string($cursor) ? $cursor : null),
            $limit === null ? 200 : (int) $limit,
        );
    }
}
