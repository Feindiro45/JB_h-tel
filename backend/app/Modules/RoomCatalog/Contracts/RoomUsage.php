<?php

namespace App\Modules\RoomCatalog\Contracts;

/**
 * Port implémenté par le module Reservations (D-058) : une chambre utilisée par au moins une
 * réservation, même annulée ou terminée, ne se supprime pas (mettez-la plutôt en maintenance).
 */
interface RoomUsage
{
    public function isUsed(int $roomId): bool;
}
