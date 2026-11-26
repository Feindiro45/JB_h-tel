<?php

namespace App\Modules\Settings\Mail;

use App\Shared\Settings\HotelIdentity;
use App\Shared\Support\Format;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** E-mail de test de la configuration d'envoi (6M). */
final class MailTestMail extends Mailable
{
    public function __construct(public readonly ?string $requestedBy) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'E-mail de test — '.app(HotelIdentity::class)->name());
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.test', with: [
            'hotel' => app(HotelIdentity::class)->name(),
            'requestedBy' => $this->requestedBy,
            'sentAt' => Format::dateTime(now()),
        ]);
    }
}
