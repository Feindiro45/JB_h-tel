<?php

namespace App\Modules\RoomCatalog\Contracts;

/**
 * Nature d'une catégorie (D-072) : chambre d'hébergement ou salle de conférence. Une salle se
 * réserve pour un événement (sans occupants) et compte à part dans les statistiques d'occupation.
 * Choisie à la création de la catégorie, elle ne se modifie plus.
 */
enum RoomKind: string
{
    case Room = 'ROOM';
    case Conference = 'CONFERENCE';

    public function label(): string
    {
        return match ($this) {
            self::Room => 'Chambre',
            self::Conference => 'Salle de conférence',
        };
    }
}
