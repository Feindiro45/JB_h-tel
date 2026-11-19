<?php

namespace Database\Seeders;

use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Database\Seeder;

/**
 * Types de chambre du cahier des charges (VIP et Standard), dans tous les environnements.
 * Idempotent : un type existant n'est pas modifié (son libellé a pu être ajusté par l'administrateur).
 */
class RoomTypesSeeder extends Seeder
{
    public const TYPES = [
        'VIP' => 'VIP',
        'STANDARD' => 'Standard',
    ];

    public function run(): void
    {
        foreach (self::TYPES as $code => $label) {
            RoomType::query()->firstOrCreate(['code' => $code], ['label' => $label]);
        }
    }
}
