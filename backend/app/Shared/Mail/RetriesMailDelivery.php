<?php

namespace App\Shared\Mail;

use DateTimeInterface;
use Illuminate\Queue\Middleware\ThrottlesExceptions;

/**
 * Envois d'e-mails en file d'attente (D-054) : un serveur SMTP indisponible ou mal configuré ne
 * fait perdre aucun message. Chaque envoi est retenté pendant 24 h ; après trois échecs en dix
 * minutes, **tous** les envois se mettent en pause dix minutes au lieu de multiplier les
 * connexions refusées (qui peuvent faire bloquer le compte ou l'adresse IP par l'hébergeur).
 * Au-delà de 24 h, le message est classé en échec : Paramètres > « Relancer les envois en échec ».
 */
trait RetriesMailDelivery
{
    /** @return list<object> */
    public function middleware(mixed ...$event): array
    {
        return [(new ThrottlesExceptions(3, 10 * 60))->by('smtp-delivery')->backoff(1)];
    }

    public function retryUntil(mixed ...$event): DateTimeInterface
    {
        return now()->addDay();
    }
}
