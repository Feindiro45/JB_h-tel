<?php

use App\Modules\Cashier\CashierServiceProvider;
use App\Modules\Customers\CustomersServiceProvider;
use App\Modules\Identity\IdentityServiceProvider;
use App\Modules\Reservations\ReservationsServiceProvider;
use App\Modules\RoomCatalog\RoomCatalogServiceProvider;
use App\Providers\AppServiceProvider;

return [
    AppServiceProvider::class,
    IdentityServiceProvider::class,
    RoomCatalogServiceProvider::class,
    CustomersServiceProvider::class,
    ReservationsServiceProvider::class,
    CashierServiceProvider::class,
];
