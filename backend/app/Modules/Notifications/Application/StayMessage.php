<?php

namespace App\Modules\Notifications\Application;

use Closure;

/** Contenu d'un e-mail adressé au client à propos de son séjour. */
final readonly class StayMessage
{
    /**
     * @param  string  $kind  Code stable (ex. `reservation.confirmed`), journalisé.
     * @param  list<string>  $lines  Paragraphes du message.
     * @param  array<string, string>  $details  Tableau « libellé → valeur ».
     * @param  list<array{name: string, data: string|Closure(): string, mime: string}>  $attachments  Contenu, ou fonction qui le produit au moment de l'envoi.
     */
    public function __construct(
        public string $kind,
        public int $reservationId,
        public string $subject,
        public string $title,
        public array $lines,
        public array $details = [],
        public ?string $actionLabel = null,
        public ?string $actionUrl = null,
        public array $attachments = [],
    ) {}
}
