<?php

namespace App\Modules\RoomCatalog\Http\Requests;

use App\Modules\RoomCatalog\DTO\RoomTypeData;
use Illuminate\Foundation\Http\FormRequest;

/** Le code d'un type de chambre est une référence stable : il ne se modifie pas. */
final class UpdateRoomTypeRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'code' => ['prohibited'],
            'label' => ['sometimes', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['code' => 'code', 'label' => 'libellé', 'description' => 'description'];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['code.prohibited' => "Le code d'un type de chambre ne peut pas être modifié."];
    }

    public function toData(): RoomTypeData
    {
        return new RoomTypeData(
            label: $this->has('label') ? $this->string('label')->trim()->toString() : null,
            description: $this->filled('description') ? $this->string('description')->trim()->toString() : null,
            descriptionProvided: $this->has('description'),
        );
    }
}
