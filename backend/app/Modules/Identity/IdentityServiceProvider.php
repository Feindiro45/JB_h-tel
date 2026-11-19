<?php

namespace App\Modules\Identity;

use App\Modules\Identity\Console\CreateAdministratorCommand;
use App\Modules\Identity\Listeners\SendStaffEmails;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

final class IdentityServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // E-mails au personnel (6M) : alerte de connexion, bienvenue et invitation.
        Event::listen(SendStaffEmails::EVENTS, SendStaffEmails::class);

        if ($this->app->runningInConsole()) {
            $this->commands([CreateAdministratorCommand::class]);
        }
    }
}
