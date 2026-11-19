<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Reporting\Http\Controllers\DashboardController;
use Illuminate\Support\Facades\Route;

/* Module Reporting (lecture seule) — chargé dans le groupe /api/v1. */

Route::middleware(['authenticated', 'permission:'.PermissionName::ReportsView->value])->group(function (): void {
    Route::get('dashboard', DashboardController::class)->name('dashboard');
});
