<?php

namespace App\Modules\Customers\Contracts;

/** Accès en lecture aux clients pour les autres modules (Reservations, Billing). */
interface CustomerDirectory
{
    public function find(int $customerId): ?CustomerSnapshot;

    public function findByUuid(string $uuid): ?CustomerSnapshot;

    /**
     * @param  list<int>  $customerIds
     * @return array<int, CustomerSnapshot> Indexé par identifiant interne.
     */
    public function findMany(array $customerIds): array;
}
