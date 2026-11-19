<?php

namespace App\Modules\Reservations\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Réservation annulée. Émis après validation de la transaction. */
final class ReservationCancelled implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $reservationId) {}
}
