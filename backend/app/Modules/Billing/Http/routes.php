<?php

use App\Modules\Billing\Http\Controllers\InvoiceController;
use App\Modules\Billing\Http\Controllers\InvoiceExportController;
use App\Modules\Billing\Http\Controllers\PublicVerificationController;
use App\Modules\Identity\Domain\PermissionName;
use Illuminate\Support\Facades\Route;

/* Module Billing — chargé dans le groupe /api/v1. Routes en UUID (D-026). */

// Vérification publique (sans connexion), même règle que la page du QR code (D-036).
Route::get('public/invoices/{invoice}/verification', [PublicVerificationController::class, 'api'])
    ->middleware('throttle:30,1')
    ->name('public.invoices.verification');

Route::middleware('authenticated')->group(function (): void {
    Route::middleware('permission:'.PermissionName::InvoicesView->value)->group(function (): void {
        Route::get('invoices', [InvoiceController::class, 'all'])->name('invoices.list');
        Route::get('invoices/export', InvoiceExportController::class)->name('invoices.export');
        Route::get('reservations/{reservation}/invoices', [InvoiceController::class, 'index'])->name('invoices.index');
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])->name('invoices.show');
    });

    Route::middleware('permission:'.PermissionName::InvoicesIssue->value)
        ->post('reservations/{reservation}/invoices', [InvoiceController::class, 'store'])->middleware('idempotent')->name('invoices.store');

    Route::middleware('permission:'.PermissionName::InvoicesCredit->value)
        ->post('invoices/{invoice}/credit-notes', [InvoiceController::class, 'credit'])->middleware('idempotent')->name('invoices.credit');
});
