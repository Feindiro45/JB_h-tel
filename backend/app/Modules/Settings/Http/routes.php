<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Settings\Http\SettingsController;
use Illuminate\Support\Facades\Route;

/* Module Settings — chargé dans le groupe /api/v1. Paramètres réservés à l'administrateur. */

Route::middleware(['authenticated', 'permission:'.PermissionName::SettingsManage->value])->group(function (): void {
    Route::get('settings', [SettingsController::class, 'index'])->name('settings.index');
    Route::put('settings/{key}', [SettingsController::class, 'update'])
        ->where('key', '[a-z_]+(\.[a-z_]+)+')
        ->name('settings.update');
});
