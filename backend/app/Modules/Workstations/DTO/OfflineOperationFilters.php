<?php

namespace App\Modules\Workstations\DTO;

/** Filtres du centre de synchronisation (opérations rejouées), écran et export Excel. */
final readonly class OfflineOperationFilters
{
    public function __construct(
        /** ACCEPTED, DUPLICATE, REJECTED. */
        public ?string $outcome = null,
        /** TO_REVIEW, REENTERED, REJECTED (rejet confirmé). */
        public ?string $review = null,
        /** Libellé de l'opération ou cause du refus. */
        public ?string $search = null,
    ) {}
}
