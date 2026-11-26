<?php

use App\Modules\Sync\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

/* Module Sync (D-069) — chargé dans le groupe /api/v1. Lecture seule : les envois passent par
 * les routes métier existantes, idempotentes (D-063), rejouées depuis la file du poste. */

Route::middleware('authenticated')->group(function (): void {
    Route::get('sync/status', [SyncController::class, 'status'])->name('sync.status');
    Route::get('sync/changes', [SyncController::class, 'changes'])->name('sync.changes');
});
