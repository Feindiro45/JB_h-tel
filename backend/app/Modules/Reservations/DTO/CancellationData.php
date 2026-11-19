<?php

namespace App\Modules\Reservations\DTO;

/**
 * Annulation (D-031, D-053) : motif obligatoire ; si de l'argent a été encaissé, le montant à
 * rembourser doit être confirmé par l'utilisateur (il doit être égal à l'encaissé net du séjour).
 */
final readonly class CancellationData
{
    public function __construct(
        public string $reason,
        public int $refundFcfa = 0,
        public ?string $refundMethod = null,
    ) {}
}
