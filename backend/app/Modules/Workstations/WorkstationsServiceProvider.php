<?php

namespace App\Modules\Workstations;

use App\Modules\Workstations\Http\Middleware\EnsureMainWorkstation;
use Illuminate\Routing\Router;
use Illuminate\Support\ServiceProvider;

/** Postes de caisse (D-062). L'alias `main.workstation` protège les écritures des autres modules. */
final class WorkstationsServiceProvider extends ServiceProvider
{
    public function boot(Router $router): void
    {
        $router->aliasMiddleware('main.workstation', EnsureMainWorkstation::class);
    }
}
