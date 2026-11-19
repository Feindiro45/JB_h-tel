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

    /** Identifiant interne d'un type de chambre à partir de son UUID public. */
    public function roomTypeIdByUuid(string $uuid): ?int;

    /**
     * Verrouille la ligne de la chambre (`SELECT … FOR UPDATE`) jusqu'à la fin de la transaction
     * en cours. Deux réservations concurrentes sur une même chambre sont ainsi traitées l'une
     * après l'autre, et la seconde revalide la disponibilité après la première.
     * À appeler **dans** une transaction.
     */
    public function lockForReservation(int $roomId): ?RoomSnapshot;
}
