<?php

namespace App\Modules\RoomCatalog\Http\Requests;

use App\Modules\RoomCatalog\Contracts\RoomKind;
use App\Modules\RoomCatalog\DTO\RoomTypeData;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreRoomTypeRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('code'))) {
            $this->merge(['code' => strtoupper(trim($this->input('code')))]);
        }
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'regex:/^[A-Z0-9_]{2,30}$/', Rule::unique('room_types', 'code')],
            'label' => ['required', 'string', 'max:100'],
            // D-072 : chambre par défaut, ou salle de conférence.
            'kind' => ['sometimes', Rule::enum(RoomKind::class)],
            'description' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['code' => 'code', 'label' => 'libellé', 'kind' => 'nature', 'description' => 'description'];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['code.regex' => 'Le code doit contenir de 2 à 30 lettres majuscules, chiffres ou « _ » (ex. VIP, STANDARD).'];
    }

    public function toData(): RoomTypeData
    {
        return new RoomTypeData(
            code: $this->string('code')->toString(),
            label: $this->string('label')->trim()->toString(),
            description: $this->filled('description') ? $this->string('description')->trim()->toString() : null,
            descriptionProvided: true,
            kind: $this->enum('kind', RoomKind::class) ?? RoomKind::Room,
        );
    }
}
