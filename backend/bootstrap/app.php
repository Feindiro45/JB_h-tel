<?php

use App\Modules\Identity\Http\Middleware\EnsureUserIsActive;
use App\Shared\Exceptions\ApiExceptionRenderer;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum en mode SPA : session par cookie et CSRF pour les requêtes du frontend (D-005).
        $middleware->statefulApi();

        // L'API ne redirige jamais vers une page de connexion : elle répond 401 (contrat JSON).
        $middleware->redirectGuestsTo(
            fn (Request $request): ?string => $request->is('api/*') || $request->expectsJson() ? null : '/'
        );

        $middleware->alias([
            'permission' => PermissionMiddleware::class,
            'role' => RoleMiddleware::class,
        ]);

        // Routes métier : utilisateur authentifié ET compte actif.
        $middleware->group('authenticated', ['auth:sanctum', EnsureUserIsActive::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson()
        );

        // Contrat d'erreur JSON en français, sans trace technique (docs/DECISIONS.md D-011).
        $exceptions->render(new ApiExceptionRenderer);
    })->create();
