<?php

namespace App\Shared\Mail;

/**
 * Adresses qui ne peuvent recevoir aucun e-mail (6M) : domaines de premier niveau réservés par les
 * RFC 2606 et 6761 (`.local`, `.localhost`, `.test`, `.example`, `.invalid`), comme les comptes de
 * démonstration `@jbhotel.local`. Les envoyer au serveur SMTP ne produirait que des rejets.
 */
final class Recipients
{
    private const RESERVED_TLDS = ['local', 'localhost', 'test', 'example', 'invalid'];

    public static function deliverable(?string $email): bool
    {
        $email = trim((string) $email);
        $at = strrpos($email, '@');
        if ($at === false || $at === 0) {
            return false;
        }
        $domain = strtolower(rtrim(substr($email, $at + 1), '.'));
        $tld = substr((string) strrchr('.'.$domain, '.'), 1);

        return $domain !== '' && ! in_array($tld, self::RESERVED_TLDS, true);
    }
}
