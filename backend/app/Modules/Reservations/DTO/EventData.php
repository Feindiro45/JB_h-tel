<?php

namespace App\Modules\Reservations\DTO;

use App\Modules\Reservations\Domain\OrganizerType;

/**
 * Réservation d'une salle de conférence (D-072) : l'événement, son type d'occupant, l'organisation
 * et la personne à contacter. Remplace les occupants d'une chambre.
 */
final readonly class EventData
{
    public function __construct(
        public string $name,
        public OrganizerType $organizerType,
        public ?string $organizerTypeOther = null,
        public ?string $organizationName = null,
        public ?string $contactName = null,
        public ?string $contactPhone = null,
    ) {}

    /** Libellé lisible du type d'occupant (« Autre » remplacé par sa précision). */
    public function organizerLabel(): string
    {
        return $this->organizerType === OrganizerType::Other && $this->organizerTypeOther !== null
            ? $this->organizerTypeOther
            : $this->organizerType->label();
    }
}
