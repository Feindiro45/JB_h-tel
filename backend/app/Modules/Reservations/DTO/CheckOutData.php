<?php

namespace App\Modules\Reservations\DTO;

/**
 * Départ (D-071, décision de l'utilisateur) : si le séjour n'est pas entièrement payé, le départ
 * reste possible mais exige le motif pour lequel le client part sans tout régler. Ignoré quand le
 * solde est nul.
 */
final readonly class CheckOutData
{
    public function __construct(
        public ?string $unpaidReason = null,
    ) {}
}
