<?php

namespace App\Modules\RoomCatalog\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\RoomCatalog\Contracts\RoomUsage;
use App\Modules\RoomCatalog\Domain\MaintenanceStatus;
use App\Modules\RoomCatalog\DTO\RoomData;
use App\Modules\RoomCatalog\Models\Room;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\RecordDeletion;
use Illuminate\Support\Facades\DB;

/**
 * Chambres individuelles (fiche 06). Pas de suppression : une chambre hors service passe en maintenance.
 */
final class RoomService
{
    public function __construct(
        private readonly AuditTrail $audit,
        private readonly RoomUsage $usage,
        private readonly RecordDeletion $deletion,
    ) {}

    /** Suppression définitive (D-058) : seulement une chambre jamais réservée. */
    public function delete(Room $room, string $reason, User $actor): void
    {
        if ($this->usage->isUsed($room->id)) {
            throw new BusinessRuleException(
                "La chambre {$room->number} figure dans des réservations : elle ne peut pas être supprimée. Mettez-la plutôt en maintenance.",
                'Suppression impossible',
                409,
                'room_in_use',
            );
        }
        $this->deletion->delete($room, 'room.deleted', 'room', $this->snapshot($room), $reason, $actor,
            "La chambre {$room->number} est encore utilisée ailleurs : elle ne peut pas être supprimée.");
    }

    public function create(RoomData $data): Room
    {
        return DB::transaction(function () use ($data): Room {
            $room = Room::query()->create([
                'number' => (string) $data->number,
                'room_type_id' => (int) $data->roomTypeId,
                'capacity' => (int) $data->capacity,
                'notes' => $data->notes,
                'maintenance_status' => MaintenanceStatus::Available,
            ]);
            $this->audit->record('room.created', 'room', $room->id, after: $this->snapshot($room));

            return $room;
        });
    }

    public function update(Room $room, RoomData $data): Room
    {
        return DB::transaction(function () use ($room, $data): Room {
            /** @var Room $room */
            $room = Room::query()->lockForUpdate()->findOrFail($room->id);
            $before = $this->snapshot($room);

            $room->fill(array_filter([
                'number' => $data->number,
                'room_type_id' => $data->roomTypeId,
                'capacity' => $data->capacity,
            ], fn ($value) => $value !== null));
            if ($data->notesProvided) {
                $room->notes = $data->notes;
            }
            $room->save();

            $this->audit->record('room.updated', 'room', $room->id, $before, $this->snapshot($room));

            return $room;
        });
    }

    public function setMaintenance(Room $room, MaintenanceStatus $status, ?string $note): Room
    {
        return DB::transaction(function () use ($room, $status, $note): Room {
            /** @var Room $room */
            $room = Room::query()->lockForUpdate()->findOrFail($room->id);
            $before = $this->snapshot($room);

            $room->maintenance_status = $status;
            $room->maintenance_note = $status === MaintenanceStatus::Maintenance ? $note : null;
            $room->save();

            $this->audit->record('room.maintenance_changed', 'room', $room->id, $before, $this->snapshot($room));

            return $room;
        });
    }

    /** @return array<string, int|string|null> */
    private function snapshot(Room $room): array
    {
        return [
            'number' => $room->number,
            'room_type_id' => $room->room_type_id,
            'capacity' => $room->capacity,
            'maintenance_status' => $room->maintenance_status->value,
            'maintenance_note' => $room->maintenance_note,
            'notes' => $room->notes,
        ];
    }
}
