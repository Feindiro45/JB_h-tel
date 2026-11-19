<?php

namespace App\Modules\Customers\Contracts;

/** Vue en lecture d'un client pour les autres modules. `id` interne, `uuid` public (D-026). */
final readonly class CustomerSnapshot
{
    public function __construct(
        public int $id,
        public string $uuid,
        public string $fullName,
        public ?string $phone,
    ) {}
}
