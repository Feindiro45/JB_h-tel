<?php

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

/*
| API REST versionnée : toutes les routes métier sont sous /api/v1 (docs/DECISIONS.md D-012).
| Chaque module enregistrera ses routes dans ce groupe.
*/

Route::prefix('v1')
    ->name('api.v1.')
    ->middleware('throttle:api')
    ->group(function (): void {
        Route::get('health', HealthController::class)->name('health');
    });
