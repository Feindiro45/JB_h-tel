<?php

namespace App\Modules\Identity\Http\Resources;

use App\Modules\Identity\Domain\RoleName;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Spatie\Permission\Models\Role;

/** @mixin Role */
final class RoleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $role = RoleName::tryFrom($this->name);

        return [
            'name' => $this->name,
            'label' => $role?->label() ?? $this->name,
            'editable' => $role !== RoleName::Admin,
            'permissions' => $this->permissions->pluck('name')->sort()->values(),
        ];
    }
}
