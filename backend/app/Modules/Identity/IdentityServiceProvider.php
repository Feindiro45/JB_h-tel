<?php

namespace App\Modules\Identity;

use App\Modules\Identity\Console\CreateAdministratorCommand;
use Illuminate\Support\ServiceProvider;

final class IdentityServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([CreateAdministratorCommand::class]);
        }
    }
}
