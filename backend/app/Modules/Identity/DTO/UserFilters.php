<?php

namespace App\Modules\Identity\DTO;

use App\Modules\Identity\Domain\RoleName;

/** Filtres de la liste des utilisateurs, partagés par l'écran et l'export Excel. */
final readonly class UserFilters
{
    public function __construct(
        /** Nom ou e-mail. */
        public ?string $search = null,
        public ?RoleName $role = null,
        /** `null` : actifs et désactivés. */
        public ?bool $active = null,
    ) {}
}
