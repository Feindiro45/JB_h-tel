<?php

namespace App\Modules\RoomCatalog\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\RoomCatalog\DTO\RoomTypeData;
use App\Modules\RoomCatalog\Models\RoomType;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\RecordDeletion;
use Illuminate\Support\Facades\DB;

final class RoomTypeService
{
    public function __construct(
        private readonly AuditTrail $audit,
        private readonly RecordDeletion $deletion,
    ) {}

    /** Suppression définitive (D-058) : seulement une catégorie sans chambre ni tarif publié. */
    public function delete(RoomType $type, string $reason, User $actor): void
    {
        if ($type->rooms()->exists()) {
            throw new BusinessRuleException(
                "La catégorie {$type->label} contient des chambres : supprimez-les ou changez leur catégorie d’abord.",
                'Suppression impossible',
                409,
                'room_type_has_rooms',
            );
        }
        if ($type->rates()->exists()) {
            throw new BusinessRuleException(
                "Des tarifs ont été publiés pour la catégorie {$type->label} : elle ne peut pas être supprimée (historique des prix).",
                'Suppression impossible',
                409,
                'room_type_has_rates',
            );
        }
        $this->deletion->delete($type, 'room_type.deleted', 'room_type', $this->snapshot($type), $reason, $actor,
            "La catégorie {$type->label} est encore utilisée ailleurs : elle ne peut pas être supprimée.");
    }

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
