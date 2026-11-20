<?php

namespace App\Modules\Reservations\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Réservation corrigée (chambre, période ou forfait, D-058). Émis après validation de la transaction. */
final class ReservationModified implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $reservationId) {}
}
