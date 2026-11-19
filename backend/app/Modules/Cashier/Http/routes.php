<?php

use App\Modules\Cashier\Http\Controllers\PaymentController;
use App\Modules\Identity\Domain\PermissionName;
use Illuminate\Support\Facades\Route;

/* Module Cashier — chargé dans le groupe /api/v1. Routes en UUID (D-026). */

Route::middleware('authenticated')->group(function (): void {
    Route::middleware('permission:'.PermissionName::PaymentsView->value)->group(function (): void {
        Route::get('reservations/{reservation}/payments', [PaymentController::class, 'index'])->name('payments.index');
        Route::get('payments/{payment}', [PaymentController::class, 'show'])->name('payments.show');
    });

    Route::middleware('permission:'.PermissionName::PaymentsRecord->value)
        ->post('reservations/{reservation}/payments', [PaymentController::class, 'store'])->name('payments.store');

    Route::middleware('permission:'.PermissionName::PaymentsCancel->value)
        ->post('payments/{payment}/cancel', [PaymentController::class, 'cancel'])->name('payments.cancel');

    Route::middleware('permission:'.PermissionName::RefundsCreate->value)
        ->post('payments/{payment}/refunds', [PaymentController::class, 'refund'])->name('payments.refunds.store');
});
