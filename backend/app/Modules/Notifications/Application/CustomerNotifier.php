<?php

namespace App\Modules\Notifications\Application;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Notifications\Mail\StayMail;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Shared\Contracts\AuditTrail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;

/**
 * Envoie un message au client de la réservation, **seulement** s'il a donné son e-mail et ne
 * s'est pas désinscrit (D-039). Chaque envoi est journalisé (sans l'adresse e-mail).
 */
final class CustomerNotifier
{
    public function __construct(
        private readonly ReservationLedger $reservations,
        private readonly CustomerDirectory $customers,
        private readonly AuditTrail $audit,
    ) {}

    public function send(StayMessage $message): bool
    {
        $reservation = $this->reservations->find($message->reservationId);
        $customer = $reservation === null ? null : $this->customers->find($reservation->customerId);
        if ($customer === null || ! $customer->canBeEmailed()) {
            return false;
        }

        $unsubscribeUrl = URL::signedRoute('public.customers.unsubscribe', ['customer' => $customer->uuid]);
        Mail::to((string) $customer->email, $customer->fullName)
            ->send(new StayMail($message, $customer->fullName, $unsubscribeUrl));

        $this->audit->record('notification.sent', 'reservation', $message->reservationId, after: [
            'kind' => $message->kind,
            'subject' => $message->subject,
            'channel' => 'email',
        ]);

        return true;
    }
}
