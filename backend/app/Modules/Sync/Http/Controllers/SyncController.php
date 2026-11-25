<?php

namespace App\Modules\Sync\Http\Controllers;

use App\Modules\Identity\Models\User;
use App\Modules\Sync\Application\Queries\ChangeFeed;
use App\Modules\Sync\Domain\SyncEntity;
use App\Modules\Sync\Http\Requests\ChangeFeedRequest;
use Illuminate\Http\JsonResponse;

/** Synchronisation des postes (D-069) : état du journal et changements après un curseur. */
final class SyncController
{
    public function __construct(private readonly ChangeFeed $feed) {}

    public function status(): JsonResponse
    {
        return response()->json(['data' => $this->feed->status()]);
    }

    public function changes(ChangeFeedRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json($this->feed->changes($request->toData(), SyncEntity::visibleTo($user)));
    }
}
