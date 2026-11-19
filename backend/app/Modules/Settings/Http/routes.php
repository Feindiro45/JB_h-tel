<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Settings\Http\SettingsController;
use Illuminate\Support\Facades\Route;

/* Module Settings — chargé dans le groupe /api/v1. Paramètres réservés à l'administrateur. */

Route::middleware(['authenticated', 'permission:'.PermissionName::SettingsManage->value])->group(function (): void {
    Route::get('settings', [SettingsController::class, 'index'])->name('settings.index');
    // Envoi des e-mails (6M) : état et e-mail de test (5 par minute).
    Route::get('settings/mail', [SettingsController::class, 'mailStatus'])->name('settings.mail');
    Route::post('settings/mail/test', [SettingsController::class, 'mailTest'])->middleware('throttle:5,1')->name('settings.mail.test');
    Route::put('settings/{key}', [SettingsController::class, 'update'])
        ->where('key', '[a-z_]+(\.[a-z_]+)+')
        ->name('settings.update');
});
