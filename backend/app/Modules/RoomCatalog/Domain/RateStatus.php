<?php

namespace App\Modules\RoomCatalog\Domain;

/** Statut d'une version tarifaire à un instant donné (calculé, jamais stocké). */
enum RateStatus: string
{
    case Active = 'ACTIVE';
    case Scheduled = 'SCHEDULED';
    case Expired = 'EXPIRED';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'En vigueur',
            self::Scheduled => 'Programmé',
            self::Expired => 'Expiré',
        };
    }
}
