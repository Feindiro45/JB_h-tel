<?php

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Http\Controllers\AuthController;
use App\Modules\Identity\Http\Controllers\RoleController;
use App\Modules\Identity\Http\Controllers\UserController;
use App\Modules\Identity\Http\Controllers\UserExportController;
use App\Modules\Identity\Models\User;
use Illuminate\Support\Facades\Route;

/*
| Module Identity — chargé dans le groupe /api/v1 (routes/api.php).
| `authenticated` = auth:sanctum + compte actif.
*/

Route::post('auth/login', [AuthController::class, 'login'])->name('auth.login');
// Lien de l'invitation (6M), sans connexion : 10 essais par minute.
Route::post('auth/password', [AuthController::class, 'setPassword'])->middleware('throttle:10,1')->name('auth.password');
// « Mot de passe oublié » (D-059), sans connexion : 5 demandes par minute.
Route::post('auth/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1')->name('auth.forgot-password');

Route::middleware('authenticated')->group(function (): void {
    Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
    // Sortie de veille (D-074) : 6 essais par minute et par utilisateur.
    Route::post('auth/confirm-password', [AuthController::class, 'confirmPassword'])->middleware('throttle:6,1')->name('auth.confirm-password');

    Route::get('users', [UserController::class, 'index'])->name('users.index')->can('viewAny', User::class);
    Route::get('users/export', UserExportController::class)->name('users.export')->can('viewAny', User::class);
    Route::post('users', [UserController::class, 'store'])->name('users.store')->can('create', User::class);
    Route::get('users/{user}', [UserController::class, 'show'])->name('users.show')->can('view', 'user');
    Route::patch('users/{user}', [UserController::class, 'update'])->name('users.update')->can('update', 'user');
    Route::post('users/{user}/invitation', [UserController::class, 'invite'])->name('users.invitation')->can('update', 'user');
    // Suppression définitive d'un compte jamais utilisé (D-058) : administrateur seulement.
    Route::delete('users/{user}', [UserController::class, 'destroy'])->name('users.destroy')
        ->middleware('permission:'.PermissionName::RecordsDelete->value);

    Route::middleware('permission:'.PermissionName::RolesManage->value)->group(function (): void {
        Route::get('roles', [RoleController::class, 'index'])->name('roles.index');
        Route::get('permissions', [RoleController::class, 'permissions'])->name('permissions.index');
        Route::put('roles/{role:name}/permissions', [RoleController::class, 'updatePermissions'])
            ->name('roles.permissions.update');
    });
});
