<?php

namespace App\Modules\RoomCatalog\Contracts;

/**
 * Accès en lecture aux chambres pour les autres modules (Reservations, Reporting),
 * sans dépendre des tables internes du catalogue.
 */
interface RoomDirectory
{
    public function find(int $roomId): ?RoomSnapshot;

    /** Recherche par identifiant public, tel que reçu de l'API. */
    public function findByUuid(string $uuid): ?RoomSnapshot;

    /** @return list<RoomSnapshot> Toutes les chambres, triées par numéro. */
    public function all(): array;
}
