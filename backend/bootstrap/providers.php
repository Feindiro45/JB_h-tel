<?php

use App\Modules\Identity\IdentityServiceProvider;
use App\Modules\RoomCatalog\RoomCatalogServiceProvider;
use App\Providers\AppServiceProvider;

return [
    AppServiceProvider::class,
    IdentityServiceProvider::class,
    RoomCatalogServiceProvider::class,
];
