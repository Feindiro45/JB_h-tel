<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Models\User;
use App\Modules\Reporting\Http\Controllers\AuditLogController;
use App\Modules\Reporting\Http\Controllers\AuditLogExportController;
use App\Modules\Reporting\Http\Controllers\DashboardController;
use App\Modules\Reporting\Http\Controllers\FinancialReportController;
use App\Modules\Reporting\Http\Controllers\ReceivablesController;
use Illuminate\Support\Facades\Route;

/* Module Reporting (lecture seule) — chargé dans le groupe /api/v1. */

Route::middleware(['authenticated', 'permission:'.PermissionName::ReportsView->value])->group(function (): void {
    Route::get('dashboard', DashboardController::class)->name('dashboard');
    Route::get('reports/financial', FinancialReportController::class)->name('reports.financial');
    Route::get('report-agents', fn () => response()->json(['data' => User::query()->orderBy('name')->get(['uuid', 'name'])->map(fn (User $user) => ['id' => $user->uuid, 'name' => $user->name])]));
});

// Soldes à encaisser : écran Caisse (droit de consulter les encaissements).
Route::middleware(['authenticated', 'permission:'.PermissionName::PaymentsView->value])
    ->get('receivables', ReceivablesController::class)->name('receivables');

// Journal d'audit : administrateur (droit de consulter l'audit).
Route::middleware(['authenticated', 'permission:'.PermissionName::AuditView->value])
    ->get('audit-logs', AuditLogController::class)->name('audit-logs');
Route::middleware(['authenticated', 'permission:'.PermissionName::AuditView->value])
    ->get('audit-logs/export', AuditLogExportController::class)->name('audit-logs.export');
Route::middleware(['authenticated', 'permission:'.PermissionName::AuditView->value])
    ->get('audit-actors', fn () => response()->json(['data' => User::query()->orderBy('name')->get(['uuid', 'name'])->map(fn (User $user) => ['id' => $user->uuid, 'name' => $user->name])]));
