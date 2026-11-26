<?php

namespace App\Modules\Reservations\Http\Requests;

/**
 * Devis : mêmes règles que la création, client facultatif (le client peut être saisi après) et
 * occupants facultatifs (le prix ne dépend que de la chambre ; une salle de conférence n'en a pas).
 */
final class QuoteReservationRequest extends ReservationRequest
{
    protected function customerRequired(): bool
    {
        return false;
    }

    protected function occupantsRequired(): bool
    {
        return false;
    }
}
