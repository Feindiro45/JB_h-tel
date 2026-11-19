<?php

namespace App\Modules\Identity\Http\Resources;

use App\Modules\Identity\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
final class UserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $role = $this->primaryRole();

        return [
            // Identifiant public : jamais la clé primaire entière (D-026).
            'id' => $this->uuid,
            'name' => $this->name,
            'email' => $this->email,
            'active' => $this->active,
            'role' => $role?->value,
            'role_label' => $role?->label(),
            'permissions' => $this->getAllPermissions()->pluck('name')->sort()->values(),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
