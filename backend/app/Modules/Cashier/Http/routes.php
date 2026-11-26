<?php

use App\Modules\Cashier\Http\Controllers\CashJournalController;
use App\Modules\Cashier\Http\Controllers\CashJournalExportController;
use App\Modules\Cashier\Http\Controllers\PaymentController;
use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Facades\Route;

/* Module Cashier — chargé dans le groupe /api/v1. Routes en UUID (D-026). */

Route::middleware('authenticated')->group(function (): void {
    Route::get('payment-methods', [PaymentController::class, 'methods'])->name('payment-methods');

    Route::middleware('permission:'.PermissionName::PaymentsView->value)->group(function (): void {
        Route::get('cash-journal', [CashJournalController::class, 'journal'])->name('cash-journal');
        Route::get('cash-journal/export', CashJournalExportController::class)->name('cash-journal.export');
        Route::get('cash-agents', fn () => response()->json(['data' => User::query()->orderBy('name')->get(['uuid', 'name'])->map(fn (User $user) => ['id' => $user->uuid, 'name' => $user->name])]));
        Route::get('payments', [CashJournalController::class, 'index'])->name('payments.list');
        Route::get('reservations/{reservation}/payments', [PaymentController::class, 'index'])->name('payments.index');
        Route::get('payments/{payment}', [PaymentController::class, 'show'])->name('payments.show');
    });

    Route::middleware('permission:'.PermissionName::PaymentsRecord->value)
        ->post('reservations/{reservation}/payments', [PaymentController::class, 'store'])->middleware(['main.workstation', 'idempotent'])->name('payments.store');

    // Annulation : l'administrateur, ou la caissière pour ses propres saisies du jour (D-058, contrôlé par le service).
    Route::middleware('permission:'.PermissionName::PaymentsCancel->value.'|'.PermissionName::PaymentsRecord->value)
        ->post('payments/{payment}/cancel', [PaymentController::class, 'cancel'])->middleware(['main.workstation', 'idempotent'])->name('payments.cancel');

    Route::middleware('permission:'.PermissionName::RefundsCreate->value)
        ->post('payments/{payment}/refunds', [PaymentController::class, 'refund'])->middleware(['main.workstation', 'idempotent'])->name('payments.refunds.store');
});
