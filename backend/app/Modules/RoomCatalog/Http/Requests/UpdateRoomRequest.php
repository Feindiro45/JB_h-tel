<?php

namespace App\Modules\RoomCatalog\Http\Requests;

use App\Modules\RoomCatalog\DTO\RoomData;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateRoomRequest extends FormRequest
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
        /** @var Room $room */
        $room = $this->route('room');

        return [
            'number' => ['sometimes', 'string', 'regex:/^[A-Za-z0-9-]{1,30}$/', Rule::unique('rooms', 'number')->ignore($room->id)],
            'room_type_id' => ['sometimes', 'uuid', Rule::exists('room_types', 'uuid')],
            'capacity' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
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
            number: $this->has('number') ? $this->string('number')->toString() : null,
            roomTypeId: $this->has('room_type_id')
                ? (int) RoomType::query()->where('uuid', $this->string('room_type_id')->toString())->value('id')
                : null,
            capacity: $this->has('capacity') ? $this->integer('capacity') : null,
            notes: $this->filled('notes') ? $this->string('notes')->trim()->toString() : null,
            notesProvided: $this->has('notes'),
        );
    }
}
