<?php

namespace App\Modules\Identity\DTO;

use App\Modules\Identity\Domain\RoleName;

/** Modification partielle : une valeur `null` signifie « inchangé ». */
final readonly class UpdateUserData
{
    public function __construct(
        public ?string $name = null,
        public ?string $email = null,
        public ?string $password = null,
        public ?RoleName $role = null,
        public ?bool $active = null,
    ) {}
}
