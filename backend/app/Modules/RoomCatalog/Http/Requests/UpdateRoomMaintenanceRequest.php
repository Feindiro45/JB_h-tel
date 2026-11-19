<?php

namespace App\Modules\RoomCatalog\Http\Requests;

use App\Modules\RoomCatalog\Domain\MaintenanceStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateRoomMaintenanceRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::enum(MaintenanceStatus::class)],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return RoomRequestAttributes::NAMES;
    }

    public function status(): MaintenanceStatus
    {
        return $this->enum('status', MaintenanceStatus::class) ?? MaintenanceStatus::Available;
    }

    public function note(): ?string
    {
        return $this->filled('note') ? $this->string('note')->trim()->toString() : null;
    }
}
