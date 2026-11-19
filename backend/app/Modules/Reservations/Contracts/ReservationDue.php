<?php

namespace App\Modules\Reservations\Contracts;

/**
 * Montant dû d'une réservation, tel que la caisse et la facturation le lisent (document 02 :
 * « Cashier reçoit un identifiant de réservation et un montant dû via un contrat de lecture »).
 */
final readonly class ReservationDue
{
    public function __construct(
        public int $id,
        public string $uuid,
        public int $netFcfa,
        public string $status,
        public string $statusLabel,
        public bool $cancelled,
        public int $customerId,
        public int $roomId,
    ) {}

    /** Montant réellement exigible : rien n'est dû sur une réservation annulée. */
    public function amountDueFcfa(): int
    {
        return $this->cancelled ? 0 : $this->netFcfa;
    }
}
