<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Http\Controllers\AuthController;
use App\Modules\Identity\Http\Controllers\RoleController;
use App\Modules\Identity\Http\Controllers\UserController;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Facades\Route;

/*
| Module Identity — chargé dans le groupe /api/v1 (routes/api.php).
| `authenticated` = auth:sanctum + compte actif.
*/

Route::post('auth/login', [AuthController::class, 'login'])->name('auth.login');

Route::middleware('authenticated')->group(function (): void {
    Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');

    Route::get('users', [UserController::class, 'index'])->name('users.index')->can('viewAny', User::class);
    Route::post('users', [UserController::class, 'store'])->name('users.store')->can('create', User::class);
    Route::get('users/{user}', [UserController::class, 'show'])->name('users.show')->can('view', 'user');
    Route::patch('users/{user}', [UserController::class, 'update'])->name('users.update')->can('update', 'user');

    Route::middleware('permission:'.PermissionName::RolesManage->value)->group(function (): void {
        Route::get('roles', [RoleController::class, 'index'])->name('roles.index');
        Route::get('permissions', [RoleController::class, 'permissions'])->name('permissions.index');
        Route::put('roles/{role:name}/permissions', [RoleController::class, 'updatePermissions'])
            ->name('roles.permissions.update');
    });
});
