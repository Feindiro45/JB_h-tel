<?php

namespace App\Modules\RoomCatalog\Http\Requests;

use App\Modules\RoomCatalog\Contracts\RoomKind;
use App\Modules\RoomCatalog\Models\RoomType;

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

    public const MAX_ROOM_CAPACITY = 50;

    /** D-072 : une salle de conférence reçoit beaucoup plus de monde qu'une chambre. */
    public const MAX_CONFERENCE_CAPACITY = 1000;

    /**
     * Capacité maximale selon la nature de la catégorie choisie (UUID envoyé) ou, à défaut, de la
     * catégorie actuelle de la chambre (identifiant interne).
     */
    public static function maxCapacity(mixed $roomTypeUuid, ?int $currentTypeId = null): int
    {
        $type = is_string($roomTypeUuid)
            ? RoomType::query()->where('uuid', $roomTypeUuid)->first()
            : ($currentTypeId === null ? null : RoomType::query()->find($currentTypeId));

        return $type?->kind === RoomKind::Conference ? self::MAX_CONFERENCE_CAPACITY : self::MAX_ROOM_CAPACITY;
    }
}
