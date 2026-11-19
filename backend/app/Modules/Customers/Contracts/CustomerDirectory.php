<?php

namespace App\Modules\Customers\Contracts;

/** Accès en lecture aux clients pour les autres modules (Reservations, Billing). */
interface CustomerDirectory
{
    public const SEARCH_LIMIT = 1000;

    public function find(int $customerId): ?CustomerSnapshot;

    public function findByUuid(string $uuid): ?CustomerSnapshot;

    /**
     * @param  list<int>  $customerIds
     * @return array<int, CustomerSnapshot> Indexé par identifiant interne.
     */
    public function findMany(array $customerIds): array;

    /**
     * Identifiants des clients correspondant à une recherche (nom, téléphone, e-mail, pièce),
     * pour les filtres « client » des autres modules. Limité à SEARCH_LIMIT résultats.
     *
     * @return list<int>
     */
    public function searchIds(string $term): array;
}
