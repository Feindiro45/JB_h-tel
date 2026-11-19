<?php

namespace App\Modules\Reservations\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Arrivée enregistrée (le séjour commence). Émis après validation de la transaction. */
final class ReservationCheckedIn implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $reservationId) {}
}
