<?php

namespace App\Modules\Identity\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * E-mail adressé à un membre du personnel (6M) : alerte de connexion, bienvenue et invitation.
 * Même présentation que les e-mails aux clients, en français, sans lien de désinscription : ces
 * messages concernent la sécurité du compte.
 */
final class StaffMail extends Mailable
{
    /**
     * @param  list<string>  $lines
     * @param  array<string, string>  $details
     */
    public function __construct(
        public readonly string $kind,
        private readonly string $subjectLine,
        private readonly string $heading,
        private readonly string $recipientName,
        private readonly array $lines,
        private readonly array $details = [],
        private readonly ?string $actionLabel = null,
        public readonly ?string $actionUrl = null,
        private readonly ?string $footnote = null,
    ) {
        $this->locale('fr');
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine.' — '.config('jbhotel.hotel.name', 'JB Hôtel'));
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.staff', with: [
            'heading' => $this->heading,
            'recipientName' => $this->recipientName,
            'lines' => $this->lines,
            'details' => $this->details,
            'actionLabel' => $this->actionLabel,
            'actionUrl' => $this->actionUrl,
            'footnote' => $this->footnote,
            'hotel' => (string) config('jbhotel.hotel.name', 'JB Hôtel'),
        ]);
    }
}
