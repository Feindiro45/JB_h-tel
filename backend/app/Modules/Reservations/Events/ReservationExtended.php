<?php

namespace App\Modules\Reservations\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Séjour prolongé (supplément validé par la caissière). Émis après validation de la transaction. */
final class ReservationExtended implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $reservationId) {}
}
