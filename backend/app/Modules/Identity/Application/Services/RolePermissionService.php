<?php

namespace App\Modules\Identity\Application\Services;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Domain\RoleName;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

final class RolePermissionService
{
    public function __construct(
        private readonly AuditTrail $audit,
        private readonly PermissionRegistrar $registrar,
    ) {}

    /**
     * @param  list<PermissionName>  $permissions
     */
    public function updatePermissions(Role $role, array $permissions): Role
    {
        if ($role->name === RoleName::Admin->value) {
            throw new BusinessRuleException(
                'Le rôle administrateur conserve toutes les permissions et ne peut pas être modifié.',
                'Modification refusée',
                409,
                'admin_role_locked',
            );
        }

        $adminOnly = array_values(array_intersect(array_map(fn (PermissionName $p) => $p->value, $permissions), array_map(fn (PermissionName $p) => $p->value, PermissionName::adminOnly())));
        if ($adminOnly !== []) {
            throw new BusinessRuleException(
                'Ce droit est réservé à l’administrateur et ne peut pas être accordé à un autre rôle : '.implode(', ', $adminOnly).'.',
                'Droit réservé',
                409,
                'permission_admin_only',
            );
        }

        return DB::transaction(function () use ($role, $permissions): Role {
            $before = $role->permissions()->pluck('name')->sort()->values()->all();
            $after = collect($permissions)->map(fn (PermissionName $p) => $p->value)->unique()->sort()->values()->all();

            $role->syncPermissions($after);
            $this->registrar->forgetCachedPermissions();

            $this->audit->record(
                'role.permissions_updated',
                'role',
                (int) $role->getKey(),
                ['permissions' => $before],
                ['permissions' => $after],
            );

            return $role->load('permissions');
        });
    }
}
