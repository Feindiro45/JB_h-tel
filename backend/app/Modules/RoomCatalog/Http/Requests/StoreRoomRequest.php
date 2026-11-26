<?php

namespace App\Modules\RoomCatalog\Http\Requests;

use App\Modules\RoomCatalog\DTO\RoomData;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** `room_type_id` est l'UUID public du type de chambre (D-026). */
final class StoreRoomRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('number'))) {
            $this->merge(['number' => trim($this->input('number'))]);
        }
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'number' => ['required', 'string', 'regex:/^[A-Za-z0-9-]{1,30}$/', Rule::unique('rooms', 'number')],
            'room_type_id' => ['required', 'uuid', Rule::exists('room_types', 'uuid')],
            'capacity' => ['required', 'integer', 'min:1', 'max:'.RoomRequestAttributes::maxCapacity($this->input('room_type_id'))],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return RoomRequestAttributes::NAMES;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return RoomRequestAttributes::MESSAGES;
    }

    public function toData(): RoomData
    {
        return new RoomData(
            number: $this->string('number')->toString(),
            roomTypeId: (int) RoomType::query()->where('uuid', $this->string('room_type_id')->toString())->value('id'),
            capacity: $this->integer('capacity'),
            notes: $this->filled('notes') ? $this->string('notes')->trim()->toString() : null,
            notesProvided: true,
        );
    }
}
