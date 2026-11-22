<?php

namespace App\Modules\Customers\DTO;

/** Filtres de la liste des clients, partagés par l'écran et l'export Excel. */
final readonly class CustomerFilters
{
    public function __construct(
        /** Nom, prénoms ou téléphone. */
        public ?string $search = null,
        public ?string $email = null,
        public ?string $originCity = null,
        public ?string $originCountry = null,
    ) {}
}
