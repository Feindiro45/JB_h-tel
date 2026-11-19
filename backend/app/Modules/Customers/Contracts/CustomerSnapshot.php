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
        public ?string $address = null,
        public ?string $email = null,
        public bool $emailNotifications = false,
    ) {}

    /** Le client a donné son e-mail et ne s'est pas désinscrit (D-039). */
    public function canBeEmailed(): bool
    {
        return $this->emailNotifications && $this->email !== null && $this->email !== '';
    }
}
