<?php

namespace Database\Seeders;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Domain\RoleName;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Idempotent, exécutable dans tous les environnements (production comprise).
 * - Crée les permissions manquantes du catalogue.
 * - Le rôle administrateur reçoit toujours toutes les permissions.
 * - Les autres rôles reçoivent leurs permissions par défaut **seulement à leur création** :
 *   les modifications faites ensuite par l'administrateur sont conservées.
 */
class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        $registrar = app(PermissionRegistrar::class);
        $registrar->forgetCachedPermissions();

        foreach (PermissionName::cases() as $permission) {
            Permission::findOrCreate($permission->value, 'web');
        }

        foreach (RoleName::cases() as $roleName) {
            $role = Role::query()->where(['name' => $roleName->value, 'guard_name' => 'web'])->first();
            $isNew = $role === null;
            $role ??= Role::create(['name' => $roleName->value, 'guard_name' => 'web']);

            if ($roleName === RoleName::Admin || $isNew) {
                $role->syncPermissions(array_map(
                    fn (PermissionName $permission) => $permission->value,
                    $roleName->defaultPermissions(),
                ));
            }
        }

        $registrar->forgetCachedPermissions();
    }
}
