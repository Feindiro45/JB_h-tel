<?php

namespace App\Modules\Reservations\Domain;

enum ReservationStatus: string
{
    case Pending = 'PENDING';
    case Confirmed = 'CONFIRMED';
    case InProgress = 'IN_PROGRESS';
    case Completed = 'COMPLETED';
    case Cancelled = 'CANCELLED';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'En attente',
            self::Confirmed => 'Confirmée',
            self::InProgress => 'En cours',
            self::Completed => 'Terminée',
            self::Cancelled => 'Annulée',
        };
    }

    /**
     * Statuts qui bloquent la chambre sur leur période. Une réservation en attente bloque aussi,
     * par prudence : elle ne doit pas pouvoir être doublée (D-029).
     *
     * @return list<string>
     */
    public static function blockingValues(): array
    {
        return [self::Pending->value, self::Confirmed->value, self::InProgress->value];
    }

    public function isOpen(): bool
    {
        return in_array($this->value, self::blockingValues(), true);
    }
}
