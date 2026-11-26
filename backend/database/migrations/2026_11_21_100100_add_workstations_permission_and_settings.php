<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/*
| Postes de caisse (D-062) : droit `workstations.manage`, réservé à l'administrateur, et deux
| paramètres provisoires. Les bases neuves les reçoivent aussi par RolesAndPermissionsSeeder et
| SettingsSeeder ; cette migration les ajoute aux bases existantes sans relancer de seeder.
*/
return new class extends Migration
{
    private const SETTINGS = [
        'workstations.enforce_main_post' => [
            'value' => false,
            'description' => 'PROVISOIRE (D-062) : réservations et encaissements réservés au poste principal (désactivé tant que l’administrateur ne l’active pas).',
        ],
        'workstations.silent_after_minutes' => [
            'value' => 5,
            'description' => 'PROVISOIRE (D-062) : délai sans signal après lequel le poste principal est considéré hors ligne ; un transfert devient alors forcé.',
        ],
    ];

    public function up(): void
    {
        $now = now();
        $permission = DB::table('permissions')->where(['name' => 'workstations.manage', 'guard_name' => 'web'])->value('id')
            ?? DB::table('permissions')->insertGetId(['name' => 'workstations.manage', 'guard_name' => 'web', 'created_at' => $now, 'updated_at' => $now]);
        $admin = DB::table('roles')->where(['name' => 'admin', 'guard_name' => 'web'])->value('id');
        if ($admin !== null) {
            DB::table('role_has_permissions')->insertOrIgnore(['permission_id' => $permission, 'role_id' => $admin]);
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (self::SETTINGS as $key => $setting) {
            DB::table('settings')->insertOrIgnore([
                'key' => $key,
                'value' => json_encode($setting['value'], JSON_THROW_ON_ERROR),
                'description' => $setting['description'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('settings')->whereIn('key', array_keys(self::SETTINGS))->delete();
        $permission = DB::table('permissions')->where(['name' => 'workstations.manage', 'guard_name' => 'web'])->value('id');
        if ($permission !== null) {
            DB::table('role_has_permissions')->where('permission_id', $permission)->delete();
            DB::table('model_has_permissions')->where('permission_id', $permission)->delete();
            DB::table('permissions')->where('id', $permission)->delete();
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
