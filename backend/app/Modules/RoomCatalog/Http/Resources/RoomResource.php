<?php

namespace App\Modules\RoomCatalog\Http\Resources;

use App\Modules\RoomCatalog\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Room */
final class RoomResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'number' => $this->number,
            'capacity' => $this->capacity,
            'room_type' => new RoomTypeResource($this->whenLoaded('roomType')),
            'maintenance_status' => $this->maintenance_status->value,
            'maintenance_label' => $this->maintenance_status->label(),
            'maintenance_note' => $this->maintenance_note,
            'notes' => $this->notes,
        ];
    }
}
