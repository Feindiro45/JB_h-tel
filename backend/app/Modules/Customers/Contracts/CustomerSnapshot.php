<?php

namespace App\Modules\Customers\Contracts;

use App\Shared\Mail\Recipients;

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
        // Une adresse d'un domaine réservé (.local, .test…) ne peut rien recevoir (6M).
        return $this->emailNotifications && Recipients::deliverable($this->email);
    }
}
