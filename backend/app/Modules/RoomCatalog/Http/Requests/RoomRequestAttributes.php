<?php

namespace App\Modules\RoomCatalog\Http\Requests;

/** Libellés français des champs et messages partagés par les validations de chambre. */
final class RoomRequestAttributes
{
    public const NAMES = [
        'number' => 'numéro de chambre',
        'room_type_id' => 'type de chambre',
        'capacity' => 'capacité',
        'notes' => 'notes',
        'status' => 'statut',
        'note' => 'motif',
    ];

    public const MESSAGES = [
        'number.regex' => 'Le numéro de chambre ne peut contenir que des lettres, des chiffres et « - » (ex. 001, 101, A-12).',
        'number.unique' => 'Une chambre porte déjà ce numéro.',
    ];
}
