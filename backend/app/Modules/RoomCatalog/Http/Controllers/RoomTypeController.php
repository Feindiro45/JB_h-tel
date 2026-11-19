<?php

namespace App\Modules\RoomCatalog\Http\Controllers;

use App\Modules\RoomCatalog\Application\Services\RoomTypeService;
use App\Modules\RoomCatalog\Http\Requests\StoreRoomTypeRequest;
use App\Modules\RoomCatalog\Http\Requests\UpdateRoomTypeRequest;
use App\Modules\RoomCatalog\Http\Resources\RoomTypeResource;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class RoomTypeController
{
    public function __construct(private readonly RoomTypeService $types) {}

    public function index(): AnonymousResourceCollection
    {
        return RoomTypeResource::collection(RoomType::query()->withCount('rooms')->orderBy('id')->get());
    }

    public function store(StoreRoomTypeRequest $request): JsonResponse
    {
        $type = $this->types->create($request->toData());

        return (new RoomTypeResource($type))->response()->setStatusCode(201);
    }

    public function update(UpdateRoomTypeRequest $request, RoomType $roomType): RoomTypeResource
    {
        return new RoomTypeResource($this->types->update($roomType, $request->toData()));
    }
}
