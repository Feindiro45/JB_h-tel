<?php

namespace App\Modules\RoomCatalog\Domain;

/** Statut courant de maintenance (D-019 : pas de périodes planifiées tant que Q-12 est ouverte). */
enum MaintenanceStatus: string
{
    case Available = 'AVAILABLE';
    case Maintenance = 'MAINTENANCE';

    public function label(): string
    {
        return match ($this) {
            self::Available => 'En service',
            self::Maintenance => 'En maintenance',
        };
    }
}
