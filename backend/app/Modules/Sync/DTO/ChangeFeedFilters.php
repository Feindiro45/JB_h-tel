<?php

namespace App\Modules\Sync\DTO;

/** Lecture du journal des changements après un curseur (D-069). */
final readonly class ChangeFeedFilters
{
    public function __construct(
        /** Dernière ligne déjà appliquée par le poste (0 : depuis le début). */
        public int $after = 0,
        public int $limit = 200,
    ) {}
}
