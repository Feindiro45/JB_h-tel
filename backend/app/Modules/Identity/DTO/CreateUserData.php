<?php

namespace App\Modules\Identity\DTO;

use App\Modules\Identity\Domain\RoleName;

final readonly class CreateUserData
{
    public function __construct(
        public string $name,
        public string $email,
        public string $password,
        public RoleName $role,
        public bool $active = true,
    ) {}
}
