<?php

namespace App\Modules\Settings;

use App\Modules\Settings\Console\MailTestCommand;
use Illuminate\Support\ServiceProvider;

final class SettingsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([MailTestCommand::class]);
        }
    }
}
