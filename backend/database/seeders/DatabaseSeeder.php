<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            // Données de référence, tous environnements.
            RolesAndPermissionsSeeder::class,
            SettingsSeeder::class,
            RoomTypesSeeder::class,
            // Démonstration, local et test uniquement.
            DemoUsersSeeder::class,
            DemoCatalogSeeder::class,
        ]);
    }
}
