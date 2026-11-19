<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Reservations\Http\Controllers\OccupancyController;
use App\Modules\Reservations\Http\Controllers\ReservationController;
use App\Modules\Reservations\Http\Controllers\ReservationExtensionController;
use Illuminate\Support\Facades\Route;

/* Module Reservations — chargé dans le groupe /api/v1. Routes en UUID (D-026). */

Route::middleware('authenticated')->group(function (): void {
    Route::middleware('permission:'.PermissionName::ReservationsView->value)->group(function (): void {
        Route::get('availability', [OccupancyController::class, 'availability'])->name('availability');
        Route::get('occupancy', [OccupancyController::class, 'occupancy'])->name('occupancy');
        Route::get('planning', [OccupancyController::class, 'planning'])->name('planning');
        Route::get('reservations', [ReservationController::class, 'index'])->name('reservations.index');
        Route::get('reservations/{reservation}', [ReservationController::class, 'show'])->name('reservations.show');
        Route::get('reservations/{reservation}/history', [ReservationController::class, 'history'])->name('reservations.history');
        Route::get('customers/{customer}/reservations', [ReservationController::class, 'forCustomer'])->name('customers.reservations');
    });

    Route::middleware('permission:'.PermissionName::ReservationsCreate->value)->group(function (): void {
        Route::post('reservations/quote', [ReservationController::class, 'quote'])->name('reservations.quote');
        Route::post('reservations', [ReservationController::class, 'store'])->name('reservations.store');
    });

    Route::middleware('permission:'.PermissionName::ReservationsUpdate->value)->group(function (): void {
        Route::post('reservations/{reservation}/confirm', [ReservationController::class, 'confirm'])->name('reservations.confirm');
        Route::put('reservations/{reservation}/occupants', [ReservationController::class, 'occupants'])->name('reservations.occupants');
        Route::post('reservations/{reservation}/extension/preview', [ReservationExtensionController::class, 'preview'])->name('reservations.extension.preview');
        Route::post('reservations/{reservation}/extension', [ReservationExtensionController::class, 'store'])->name('reservations.extension.store');
    });

    Route::middleware('permission:'.PermissionName::ReservationsCancel->value)->group(function (): void {
        Route::post('reservations/{reservation}/cancel', [ReservationController::class, 'cancel'])->name('reservations.cancel');
    });

    Route::middleware('permission:'.PermissionName::ReservationsCheckInOut->value)->group(function (): void {
        Route::post('reservations/{reservation}/check-in', [ReservationController::class, 'checkIn'])->name('reservations.check-in');
        Route::post('reservations/{reservation}/check-out', [ReservationController::class, 'checkOut'])->name('reservations.check-out');
    });
});
