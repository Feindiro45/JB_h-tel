<?php

namespace App\Providers;

use App\Shared\Audit\DatabaseAuditTrail;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Settings\SettingsRepository;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(AuditTrail::class, DatabaseAuditTrail::class);
        // Un cache par requête (ou par tâche) : les paramètres modifiés s'appliquent à la suivante.
        $this->app->scoped(SettingsRepository::class);
    }

    public function boot(): void
    {
        // Hors production : interdit le lazy loading et les attributs ignorés en silence.
        Model::shouldBeStrict(! $this->app->isProduction());

        // Données financières : bloque migrate:fresh, db:wipe… en production.
        DB::prohibitDestructiveCommands($this->app->isProduction());

        // 120 requêtes par minute et par utilisateur ; réglable (API_RATE_LIMIT_PER_MINUTE), la
        // recette navigateur enchaînant des pages bien plus vite qu'un humain.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute((int) config('jbhotel.api_rate_limit', 120))
            ->by((string) ($request->user()?->getAuthIdentifier() ?? $request->ip())));
    }
}
