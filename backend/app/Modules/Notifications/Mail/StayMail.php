<?php

namespace App\Modules\Notifications\Mail;

use App\Modules\Notifications\Application\StayMessage;
use Illuminate\Mail\Attachment;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** E-mail adressé au client à propos de son séjour (modèle `mail.stay`, en français). */
final class StayMail extends Mailable
{
    public function __construct(
        public readonly StayMessage $message,
        public readonly string $customerName,
        public readonly string $unsubscribeUrl,
    ) {
        $this->locale('fr');
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->message->subject.' — '.config('jbhotel.hotel.name', 'JB Hôtel'));
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.stay', with: [
            'stay' => $this->message,
            'customerName' => $this->customerName,
            'unsubscribeUrl' => $this->unsubscribeUrl,
            'hotel' => (string) config('jbhotel.hotel.name', 'JB Hôtel'),
        ]);
    }

    /** @return list<Attachment> */
    public function attachments(): array
    {
        return array_map(
            fn (array $file) => Attachment::fromData(fn () => $file['data'], $file['name'])->withMime($file['mime']),
            $this->message->attachments,
        );
    }
}
