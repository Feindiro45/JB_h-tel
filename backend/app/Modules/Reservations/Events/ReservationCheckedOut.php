<?php

namespace App\Modules\Reservations\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Départ enregistré (séjour clôturé). Émis après validation de la transaction. */
final class ReservationCheckedOut implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $reservationId) {}
}
