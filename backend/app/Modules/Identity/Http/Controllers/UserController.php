<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Application\Services\UserAdministrationService;
use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\Http\Requests\StoreUserRequest;
use App\Modules\Identity\Http\Requests\UpdateUserRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class UserController
{
    private const RELATIONS = ['roles.permissions', 'permissions'];

    public function __construct(private readonly UserAdministrationService $users) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $search = $request->string('search')->trim()->toString();
        $role = RoleName::tryFrom($request->string('role')->toString());

        $users = User::query()
            ->with(self::RELATIONS)
            ->when($search !== '', fn ($query) => $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")))
            ->when($role !== null, fn ($query) => $query->role($role->value))
            ->when($request->has('active'), fn ($query) => $query->where('active', $request->boolean('active')))
            ->orderBy('name')
            ->paginate(25)
            ->withQueryString();

        return UserResource::collection($users);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = $this->users->create($request->toData());

        return (new UserResource($user->load(self::RELATIONS)))->response()->setStatusCode(201);
    }

    public function show(User $user): UserResource
    {
        return new UserResource($user->load(self::RELATIONS));
    }

    public function update(UpdateUserRequest $request, User $user): UserResource
    {
        /** @var User $actor */
        $actor = $request->user();
        $user = $this->users->update($user, $request->toData(), $actor);

        return new UserResource($user->load(self::RELATIONS));
    }
}
