<?php

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

/*
| API REST versionnée : toutes les routes métier sont sous /api/v1 (docs/DECISIONS.md D-012).
| Chaque module déclare ses routes dans app/Modules/<Module>/Http/routes.php, chargé ici.
*/

Route::prefix('v1')
    ->name('api.v1.')
    ->middleware('throttle:api')
    ->group(function (): void {
        Route::get('health', HealthController::class)->name('health');

        require app_path('Modules/Identity/Http/routes.php');
        require app_path('Modules/RoomCatalog/Http/routes.php');
        require app_path('Modules/Customers/Http/routes.php');
        require app_path('Modules/Reservations/Http/routes.php');
        require app_path('Modules/Cashier/Http/routes.php');
        require app_path('Modules/Billing/Http/routes.php');
        require app_path('Modules/Reporting/Http/routes.php');
    });
