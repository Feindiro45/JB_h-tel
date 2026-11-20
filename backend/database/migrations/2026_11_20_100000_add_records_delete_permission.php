<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/*
| Droit de suppression définitive (D-058, demande du 20/11/2026), réservé au rôle administrateur.
| Les bases neuves le reçoivent aussi par RolesAndPermissionsSeeder ; cette migration l'ajoute
| aux bases existantes sans relancer de seeder.
*/
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $permission = DB::table('permissions')->where(['name' => 'records.delete', 'guard_name' => 'web'])->value('id')
            ?? DB::table('permissions')->insertGetId(['name' => 'records.delete', 'guard_name' => 'web', 'created_at' => $now, 'updated_at' => $now]);
        $admin = DB::table('roles')->where(['name' => 'admin', 'guard_name' => 'web'])->value('id');
        if ($admin !== null) {
            DB::table('role_has_permissions')->insertOrIgnore(['permission_id' => $permission, 'role_id' => $admin]);
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        $permission = DB::table('permissions')->where(['name' => 'records.delete', 'guard_name' => 'web'])->value('id');
        if ($permission !== null) {
            DB::table('role_has_permissions')->where('permission_id', $permission)->delete();
            DB::table('model_has_permissions')->where('permission_id', $permission)->delete();
            DB::table('permissions')->where('id', $permission)->delete();
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
