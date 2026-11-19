<?php

namespace App\Modules\RoomCatalog\Http\Resources;

use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin RoomType */
final class RoomTypeResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'code' => $this->code,
            'label' => $this->label,
            'description' => $this->description,
            'rooms_count' => $this->whenCounted('rooms'),
        ];
    }
}
