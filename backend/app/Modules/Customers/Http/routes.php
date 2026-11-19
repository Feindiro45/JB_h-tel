<?php

use App\Modules\Customers\Http\Controllers\CustomerController;
use App\Modules\Identity\Domain\PermissionName;
use Illuminate\Support\Facades\Route;

/* Module Customers — chargé dans le groupe /api/v1. Routes en UUID (D-026). */

Route::middleware('authenticated')->group(function (): void {
    Route::middleware('permission:'.PermissionName::CustomersView->value)->group(function (): void {
        Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
        Route::get('customers/{customer}', [CustomerController::class, 'show'])->name('customers.show');
    });

    Route::middleware('permission:'.PermissionName::CustomersManage->value)->group(function (): void {
        Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
        Route::patch('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
    });
});
