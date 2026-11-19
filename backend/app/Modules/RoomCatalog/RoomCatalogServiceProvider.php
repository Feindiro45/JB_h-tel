<?php

namespace App\Modules\RoomCatalog;

use App\Modules\RoomCatalog\Contracts\CurrentPriceProvider;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Modules\RoomCatalog\Infrastructure\EloquentCurrentPriceProvider;
use App\Modules\RoomCatalog\Infrastructure\EloquentRoomDirectory;
use Illuminate\Support\ServiceProvider;

/**
 * Les autres modules ne dépendent que de `App\Modules\RoomCatalog\Contracts` (API publique) ;
 * les implémentations restent internes au module.
 */
final class RoomCatalogServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(CurrentPriceProvider::class, EloquentCurrentPriceProvider::class);
        $this->app->bind(RoomDirectory::class, EloquentRoomDirectory::class);
    }
}
