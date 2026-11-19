<?php

namespace App\Modules\RoomCatalog\Http\Controllers;

use App\Modules\RoomCatalog\Application\Services\RoomService;
use App\Modules\RoomCatalog\Domain\MaintenanceStatus;
use App\Modules\RoomCatalog\Http\Requests\StoreRoomRequest;
use App\Modules\RoomCatalog\Http\Requests\UpdateRoomMaintenanceRequest;
use App\Modules\RoomCatalog\Http\Requests\UpdateRoomRequest;
use App\Modules\RoomCatalog\Http\Resources\RoomResource;
use App\Modules\RoomCatalog\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Str;

/**
 * Page « Chambres » (fiche 06) : liste avec recherche par numéro et filtres par type et maintenance.
 * Le filtre de disponibilité sur une période, calculé à partir des réservations, arrive en phase 4.
 */
final class RoomController
{
    public function __construct(private readonly RoomService $rooms) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $search = $request->string('search')->trim()->toString();
        $typeUuid = $request->string('room_type_id')->toString();
        $maintenance = MaintenanceStatus::tryFrom($request->string('maintenance_status')->toString());

        $rooms = Room::query()
            ->with('roomType')
            ->when($search !== '', fn ($query) => $query->where('number', 'like', "%{$search}%"))
            ->when(Str::isUuid($typeUuid), fn ($query) => $query->whereRelation('roomType', 'uuid', $typeUuid))
            ->when($maintenance !== null, fn ($query) => $query->where('maintenance_status', $maintenance?->value))
            ->orderByNumber()
            ->get();

        return RoomResource::collection($rooms);
    }

    public function show(Room $room): RoomResource
    {
        return new RoomResource($room->load('roomType'));
    }

    public function store(StoreRoomRequest $request): JsonResponse
    {
        $room = $this->rooms->create($request->toData());

        return (new RoomResource($room->load('roomType')))->response()->setStatusCode(201);
    }

    public function update(UpdateRoomRequest $request, Room $room): RoomResource
    {
        return new RoomResource($this->rooms->update($room, $request->toData())->load('roomType'));
    }

    public function updateMaintenance(UpdateRoomMaintenanceRequest $request, Room $room): RoomResource
    {
        $room = $this->rooms->setMaintenance($room, $request->status(), $request->note());

        return new RoomResource($room->load('roomType'));
    }
}
