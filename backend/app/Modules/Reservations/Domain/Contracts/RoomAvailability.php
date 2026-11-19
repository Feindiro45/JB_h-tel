<?php

namespace App\Modules\Reservations\Domain\Contracts;

use App\Modules\Reservations\Models\Reservation;
use Carbon\CarbonImmutable;

/** Contrat de disponibilité (document 02) : réservations qui bloquent une chambre sur un intervalle. */
interface RoomAvailability
{
    /**
     * @return list<Reservation> Réservations bloquantes chevauchant `[from, until[`, triées.
     */
    public function conflicts(int $roomId, CarbonImmutable $from, CarbonImmutable $until, ?int $exceptReservationId = null): array;
}
