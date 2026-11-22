<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Workstations\Http\Controllers\OfflineController;
use App\Modules\Workstations\Http\Controllers\WorkstationController;
use Illuminate\Support\Facades\Route;

/* Module Workstations (postes de caisse, D-062) — chargé dans le groupe /api/v1. */

Route::middleware('authenticated')->group(function (): void {
    // Chaque navigateur connecté s'enregistre puis signale sa présence (toutes les 30 s).
    Route::post('workstations/register', [WorkstationController::class, 'register'])
        ->middleware('throttle:10,1')
        ->name('workstations.register');
    Route::post('workstations/heartbeat', [WorkstationController::class, 'heartbeat'])->name('workstations.heartbeat');

    Route::middleware('permission:'.PermissionName::WorkstationsManage->value)->group(function (): void {
        Route::get('workstations', [WorkstationController::class, 'index'])->name('workstations.index');
        Route::patch('workstations/{workstation}', [WorkstationController::class, 'rename'])->name('workstations.rename');
        Route::post('workstations/{workstation}/designate', [WorkstationController::class, 'designate'])->name('workstations.designate');
        Route::post('workstations/{workstation}/revoke', [WorkstationController::class, 'revoke'])->name('workstations.revoke');
        Route::post('workstations/{workstation}/reactivate', [WorkstationController::class, 'reactivate'])->name('workstations.reactivate');
    });

    // Module administrateur « Mode hors ligne » (lot 4A) : état des postes et centre de synchronisation.
    Route::middleware('permission:'.PermissionName::OfflineManage->value)->group(function (): void {
        Route::get('offline/overview', [OfflineController::class, 'overview'])->name('offline.overview');
        Route::get('offline/operations', [OfflineController::class, 'operations'])->name('offline.operations');
        Route::post('offline/operations/{offlineOperation}/review', [OfflineController::class, 'review'])->name('offline.operations.review');
    });
});
