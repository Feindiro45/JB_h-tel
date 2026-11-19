<?php

namespace App\Modules\Notifications\Listeners;

use App\Modules\Billing\Events\InvoiceIssued;
use App\Modules\Cashier\Events\PaymentRecorded;
use App\Modules\Cashier\Events\PaymentRefunded;
use App\Modules\Notifications\Application\CustomerNotifier;
use App\Modules\Notifications\Application\StayMessageFactory;
use App\Modules\Reservations\Events\ReservationCancelled;
use App\Modules\Reservations\Events\ReservationCheckedIn;
use App\Modules\Reservations\Events\ReservationCheckedOut;
use App\Modules\Reservations\Events\ReservationConfirmed;
use App\Modules\Reservations\Events\ReservationExtended;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Écoute les événements métier (émis après validation de la transaction) et envoie l'e-mail
 * correspondant **en file d'attente** : un envoi lent ou en échec ne bloque jamais l'opération
 * de caisse, et il est retenté automatiquement.
 */
final class NotifyCustomer implements ShouldQueue
{
    public const EVENTS = [
        ReservationConfirmed::class,
        ReservationCheckedIn::class,
        ReservationExtended::class,
        ReservationCancelled::class,
        ReservationCheckedOut::class,
        PaymentRecorded::class,
        PaymentRefunded::class,
        InvoiceIssued::class,
    ];

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [60, 300];

    public function __construct(
        private readonly StayMessageFactory $messages,
        private readonly CustomerNotifier $notifier,
    ) {}

    public function handle(object $event): void
    {
        $message = match (true) {
            $event instanceof ReservationConfirmed => $this->messages->confirmed($event->reservationId),
            $event instanceof ReservationCheckedIn => $this->messages->checkedIn($event->reservationId),
            $event instanceof ReservationExtended => $this->messages->extended($event->reservationId),
            $event instanceof ReservationCancelled => $this->messages->cancelled($event->reservationId),
            $event instanceof ReservationCheckedOut => $this->messages->checkedOut($event->reservationId),
            $event instanceof PaymentRecorded => $this->messages->paymentRecorded($event->paymentId),
            $event instanceof PaymentRefunded => $this->messages->paymentRefunded($event->refundId),
            $event instanceof InvoiceIssued => $this->messages->invoiceIssued($event->invoiceId),
            default => null,
        };

        if ($message !== null) {
            $this->notifier->send($message);
        }
    }
}
