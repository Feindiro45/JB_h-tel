<?php

namespace App\Modules\Reservations\Domain;

/**
 * Type d'occupant d'une salle de conférence (D-072, liste validée par l'utilisateur le
 * 25/11/2026). « Autre » exige une précision.
 */
enum OrganizerType: string
{
    case Ngo = 'NGO';
    case InternationalOrganization = 'INTERNATIONAL_ORGANIZATION';
    case Company = 'COMPANY';
    case PublicAdministration = 'PUBLIC_ADMINISTRATION';
    case Association = 'ASSOCIATION';
    case Individual = 'INDIVIDUAL';
    case Other = 'OTHER';

    public function label(): string
    {
        return match ($this) {
            self::Ngo => 'ONG',
            self::InternationalOrganization => 'Organisation internationale',
            self::Company => 'Entreprise',
            self::PublicAdministration => 'Administration publique',
            self::Association => 'Association / confession religieuse',
            self::Individual => 'Particulier',
            self::Other => 'Autre',
        };
    }
}
