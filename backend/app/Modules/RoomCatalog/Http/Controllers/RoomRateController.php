<?php

namespace App\Modules\RoomCatalog\Http\Controllers;

use App\Modules\RoomCatalog\Application\Queries\RateHistory;
use App\Modules\RoomCatalog\Application\Services\RateService;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Http\Requests\PublishRateRequest;
use App\Modules\RoomCatalog\Http\Resources\RateResource;
use App\Modules\RoomCatalog\Http\Resources\RoomTypeResource;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

/** Écran « Tarifs » (charte 05) : grille VIP/Standard × demi-journée/journée et historique des versions. */
final class RoomRateController
{
    public function __construct(
        private readonly RateService $rates,
        private readonly RateHistory $history,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $typeUuid = $request->string('room_type_id')->toString();
        $typeId = Str::isUuid($typeUuid) ? RoomType::query()->where('uuid', $typeUuid)->value('id') : null;
        $unit = BillingUnit::tryFrom($request->string('billing_unit')->toString());

        if ($typeUuid !== '' && $typeId === null) {
            return RateResource::collection([]);
        }

        return RateResource::collection($this->history->entries(is_numeric($typeId) ? (int) $typeId : null, $unit));
    }

    public function grid(Request $request): JsonResponse
    {
        $rows = array_map(fn (array $row) => [
            'room_type' => (new RoomTypeResource($row['room_type']))->toArray($request),
            'rates' => array_map(fn (array $cell) => [
                'current' => $cell['current'] ? (new RateResource($cell['current']))->toArray($request) : null,
                'next' => $cell['next'] ? (new RateResource($cell['next']))->toArray($request) : null,
            ], $row['rates']),
        ], $this->history->grid());

        return new JsonResponse(['data' => $rows]);
    }

    public function store(PublishRateRequest $request): JsonResponse
    {
        $rate = $this->rates->publish($request->toData());

        return (new RateResource($rate->load(['roomType', 'creator'])))->response()->setStatusCode(201);
    }

    public function destroy(RoomRate $roomRate): Response
    {
        $this->rates->withdraw($roomRate);

        return response()->noContent();
    }
}
