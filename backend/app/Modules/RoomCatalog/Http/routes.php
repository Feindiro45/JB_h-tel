<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\RoomCatalog\Http\Controllers\RoomController;
use App\Modules\RoomCatalog\Http\Controllers\RoomRateController;
use App\Modules\RoomCatalog\Http\Controllers\RoomTypeController;
use Illuminate\Support\Facades\Route;

/*
| Module RoomCatalog — chargé dans le groupe /api/v1 (routes/api.php).
| Toutes les routes utilisent l'UUID public des entités (D-026).
*/

Route::middleware('authenticated')->group(function (): void {
    Route::middleware('permission:'.PermissionName::RoomsView->value)->group(function (): void {
        Route::get('room-types', [RoomTypeController::class, 'index'])->name('room-types.index');
        Route::get('rooms', [RoomController::class, 'index'])->name('rooms.index');
        Route::get('rooms/{room}', [RoomController::class, 'show'])->name('rooms.show');
    });

    Route::middleware('permission:'.PermissionName::RoomsManage->value)->group(function (): void {
        Route::post('room-types', [RoomTypeController::class, 'store'])->name('room-types.store');
        Route::patch('room-types/{roomType}', [RoomTypeController::class, 'update'])->name('room-types.update');
        Route::post('rooms', [RoomController::class, 'store'])->name('rooms.store');
        Route::patch('rooms/{room}', [RoomController::class, 'update'])->name('rooms.update');
        Route::put('rooms/{room}/maintenance', [RoomController::class, 'updateMaintenance'])->name('rooms.maintenance');
    });

    Route::middleware('permission:'.PermissionName::RatesView->value)->group(function (): void {
        Route::get('room-rates', [RoomRateController::class, 'index'])->name('room-rates.index');
        Route::get('room-rates/grid', [RoomRateController::class, 'grid'])->name('room-rates.grid');
    });

    Route::middleware('permission:'.PermissionName::RatesManage->value)->group(function (): void {
        Route::post('room-rates', [RoomRateController::class, 'store'])->name('room-rates.store');
        Route::delete('room-rates/{roomRate}', [RoomRateController::class, 'destroy'])->name('room-rates.destroy');
    });
});
