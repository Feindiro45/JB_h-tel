<?php

namespace App\Modules\Reservations;

use App\Modules\Reservations\Domain\Contracts\RoomAvailability;
use App\Modules\Reservations\Infrastructure\EloquentRoomAvailability;
use Illuminate\Support\ServiceProvider;

/**
 * Le module Reservations dépend uniquement des contrats publics de RoomCatalog et de Customers,
 * jamais de leurs tables ou modèles internes.
 */
final class ReservationsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(RoomAvailability::class, EloquentRoomAvailability::class);
    }
}
