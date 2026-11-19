<?php

namespace App\Modules\RoomCatalog\Application\Services;

use App\Modules\RoomCatalog\DTO\RoomTypeData;
use App\Modules\RoomCatalog\Models\RoomType;
use App\Shared\Contracts\AuditTrail;
use Illuminate\Support\Facades\DB;

final class RoomTypeService
{
    public function __construct(private readonly AuditTrail $audit) {}

    public function create(RoomTypeData $data): RoomType
    {
        return DB::transaction(function () use ($data): RoomType {
            $type = RoomType::query()->create([
                'code' => strtoupper((string) $data->code),
                'label' => (string) $data->label,
                'description' => $data->description,
            ]);
            $this->audit->record('room_type.created', 'room_type', $type->id, after: $this->snapshot($type));

            return $type;
        });
    }

    public function update(RoomType $type, RoomTypeData $data): RoomType
    {
        return DB::transaction(function () use ($type, $data): RoomType {
            $before = $this->snapshot($type);
            if ($data->label !== null) {
                $type->label = $data->label;
            }
            if ($data->descriptionProvided) {
                $type->description = $data->description;
            }
            $type->save();
            $this->audit->record('room_type.updated', 'room_type', $type->id, $before, $this->snapshot($type));

            return $type;
        });
    }

    /** @return array<string, string|null> */
    private function snapshot(RoomType $type): array
    {
        return ['code' => $type->code, 'label' => $type->label, 'description' => $type->description];
    }
}
