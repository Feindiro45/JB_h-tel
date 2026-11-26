<?php

use App\Modules\Billing\BillingServiceProvider;
use App\Modules\Cashier\CashierServiceProvider;
use App\Modules\Customers\CustomersServiceProvider;
use App\Modules\Identity\IdentityServiceProvider;
use App\Modules\Notifications\NotificationsServiceProvider;
use App\Modules\Reservations\ReservationsServiceProvider;
use App\Modules\RoomCatalog\RoomCatalogServiceProvider;
use App\Modules\Settings\SettingsServiceProvider;
use App\Modules\Sync\SyncServiceProvider;
use App\Modules\Workstations\WorkstationsServiceProvider;
use App\Providers\AppServiceProvider;

return [
    AppServiceProvider::class,
    IdentityServiceProvider::class,
    RoomCatalogServiceProvider::class,
    CustomersServiceProvider::class,
    ReservationsServiceProvider::class,
    CashierServiceProvider::class,
    BillingServiceProvider::class,
    NotificationsServiceProvider::class,
    SettingsServiceProvider::class,
    WorkstationsServiceProvider::class,
    SyncServiceProvider::class,
];
