<?php

namespace App\Modules\Reservations\Http\Requests;

/** Devis : mêmes règles que la création, client facultatif (le client peut être saisi après). */
final class QuoteReservationRequest extends ReservationRequest
{
    protected function customerRequired(): bool
    {
        return false;
    }
}
