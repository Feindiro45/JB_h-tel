<?php

namespace App\Modules\Workstations;

use App\Modules\Workstations\Http\Middleware\EnsureMainWorkstation;
use App\Modules\Workstations\Http\Middleware\RecordOfflineReplay;
use Illuminate\Routing\Router;
use Illuminate\Support\ServiceProvider;

/**
 * Postes de caisse (D-062) et mode hors ligne (lot 4A). L'alias `main.workstation` protège les
 * écritures des autres modules ; le journal des rejeus s'applique à toute l'API.
 */
final class WorkstationsServiceProvider extends ServiceProvider
{
    public function boot(Router $router): void
    {
        $router->aliasMiddleware('main.workstation', EnsureMainWorkstation::class);
        // Journal des opérations rejouées par un poste hors ligne (lot 4A.4) : sans effet sans l’en-tête.
        $router->pushMiddlewareToGroup('api', RecordOfflineReplay::class);
    }
}
