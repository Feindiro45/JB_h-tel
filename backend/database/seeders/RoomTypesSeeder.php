<?php

namespace Database\Seeders;

use App\Modules\RoomCatalog\Contracts\RoomKind;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Database\Seeder;

/**
 * Types de chambre du cahier des charges (VIP et Standard) et catégorie « Salle de conférence »
 * (D-072), dans tous les environnements. Idempotent : un type existant n'est pas modifié (son
 * libellé a pu être ajusté par l'administrateur). La migration 2026_11_25_100000 crée déjà la
 * salle de conférence ; ce seeder la recrée si la table a été vidée.
 */
class RoomTypesSeeder extends Seeder
{
    public const TYPES = [
        'VIP' => 'VIP',
        'STANDARD' => 'Standard',
    ];

    public const CONFERENCE_CODE = 'SALLE_CONFERENCE';

    public function run(): void
    {
        foreach (self::TYPES as $code => $label) {
            RoomType::query()->firstOrCreate(['code' => $code], ['label' => $label]);
        }
        RoomType::query()->firstOrCreate(['code' => self::CONFERENCE_CODE], [
            'label' => 'Salle de conférence',
            'kind' => RoomKind::Conference,
            'description' => 'Location de salle pour un événement (réunion, atelier, formation, cérémonie).',
        ]);
    }
}
