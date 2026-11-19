<?php

namespace App\Modules\Identity\Policies;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Models\User;

final class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermissionTo(PermissionName::UsersView->value);
    }

    public function view(User $actor, User $user): bool
    {
        return $actor->is($user) || $actor->hasPermissionTo(PermissionName::UsersView->value);
    }

    public function create(User $actor): bool
    {
        return $actor->hasPermissionTo(PermissionName::UsersManage->value);
    }

    public function update(User $actor, User $user): bool
    {
        return $actor->hasPermissionTo(PermissionName::UsersManage->value);
    }
}
