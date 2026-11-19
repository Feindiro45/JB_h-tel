<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Application\Services\RolePermissionService;
use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Http\Requests\UpdateRolePermissionsRequest;
use App\Modules\Identity\Http\Resources\RoleResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Spatie\Permission\Models\Role;

final class RoleController
{
    public function __construct(private readonly RolePermissionService $roles) {}

    public function index(): AnonymousResourceCollection
    {
        return RoleResource::collection(Role::query()->with('permissions')->orderBy('id')->get());
    }

    /** Catalogue des permissions, avec leur libellé français. */
    public function permissions(): JsonResponse
    {
        return new JsonResponse([
            'data' => array_map(fn (PermissionName $permission) => [
                'name' => $permission->value,
                'label' => $permission->label(),
            ], PermissionName::cases()),
        ]);
    }

    public function updatePermissions(UpdateRolePermissionsRequest $request, Role $role): RoleResource
    {
        return new RoleResource($this->roles->updatePermissions($role, $request->permissions()));
    }
}
