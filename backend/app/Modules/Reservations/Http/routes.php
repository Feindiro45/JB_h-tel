<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Reservations\Http\Controllers\DepartureAlertsController;
use App\Modules\Reservations\Http\Controllers\OccupancyController;
use App\Modules\Reservations\Http\Controllers\ReservationController;
use App\Modules\Reservations\Http\Controllers\ReservationCorrectionController;
use App\Modules\Reservations\Http\Controllers\ReservationExportController;
use App\Modules\Reservations\Http\Controllers\ReservationExtensionController;
use Illuminate\Support\Facades\Route;

/* Module Reservations — chargé dans le groupe /api/v1. Routes en UUID (D-026). */

// D-062 : les écritures portent `main.workstation` (réservées au poste principal quand l’admin l’active).
Route::middleware('authenticated')->group(function (): void {
    Route::middleware('permission:'.PermissionName::ReservationsView->value)->group(function (): void {
        Route::get('alerts', [DepartureAlertsController::class, 'index'])->name('alerts.index');
        Route::get('alerts/summary', [DepartureAlertsController::class, 'summary'])->name('alerts.summary');
        Route::get('availability', [OccupancyController::class, 'availability'])->name('availability');
        Route::get('occupancy', [OccupancyController::class, 'occupancy'])->name('occupancy');
        Route::get('planning', [OccupancyController::class, 'planning'])->name('planning');
        Route::get('reservations', [ReservationController::class, 'index'])->name('reservations.index');
        // Export Excel (avant la route paramétrée : « export » n'est pas un identifiant).
        Route::get('reservations/export', ReservationExportController::class)->name('reservations.export');
        Route::get('reservations/{reservation}', [ReservationController::class, 'show'])->name('reservations.show');
        Route::get('reservations/{reservation}/history', [ReservationController::class, 'history'])->name('reservations.history');
        Route::get('customers/{customer}/reservations', [ReservationController::class, 'forCustomer'])->name('customers.reservations');
    });

    Route::middleware('permission:'.PermissionName::ReservationsCreate->value)->group(function (): void {
        Route::post('reservations/quote', [ReservationController::class, 'quote'])->name('reservations.quote');
        Route::post('reservations', [ReservationController::class, 'store'])->middleware(['main.workstation', 'idempotent'])->name('reservations.store');
    });

    Route::middleware('permission:'.PermissionName::ReservationsUpdate->value)->group(function (): void {
        Route::post('reservations/{reservation}/confirm', [ReservationController::class, 'confirm'])->middleware(['main.workstation', 'idempotent'])->name('reservations.confirm');
        Route::put('reservations/{reservation}/occupants', [ReservationController::class, 'occupants'])->middleware(['main.workstation', 'idempotent'])->name('reservations.occupants');
        Route::post('reservations/{reservation}/extension/preview', [ReservationExtensionController::class, 'preview'])->name('reservations.extension.preview');
        Route::post('reservations/{reservation}/extension', [ReservationExtensionController::class, 'store'])->middleware(['main.workstation', 'idempotent'])->name('reservations.extension.store');
        // Correction avant le séjour (D-058).
        Route::post('reservations/{reservation}/modification/preview', [ReservationCorrectionController::class, 'preview'])->name('reservations.modification.preview');
        Route::post('reservations/{reservation}/modification', [ReservationCorrectionController::class, 'modify'])->middleware(['main.workstation', 'idempotent'])->name('reservations.modification');
    });

    // Suppression définitive d'une réservation saisie par erreur (D-058) : administrateur seulement.
    Route::middleware('permission:'.PermissionName::RecordsDelete->value)
        ->delete('reservations/{reservation}', [ReservationCorrectionController::class, 'destroy'])->name('reservations.destroy');

    Route::middleware('permission:'.PermissionName::ReservationsCancel->value)->group(function (): void {
        Route::post('reservations/{reservation}/cancel', [ReservationController::class, 'cancel'])->middleware(['main.workstation', 'idempotent'])->name('reservations.cancel');
    });

    Route::middleware('permission:'.PermissionName::ReservationsCheckInOut->value)->group(function (): void {
        Route::post('reservations/{reservation}/check-in', [ReservationController::class, 'checkIn'])->middleware(['main.workstation', 'idempotent'])->name('reservations.check-in');
        Route::post('reservations/{reservation}/check-out', [ReservationController::class, 'checkOut'])->middleware(['main.workstation', 'idempotent'])->name('reservations.check-out');
    });
});
