<?php

namespace App\Modules\Notifications;

use App\Modules\Notifications\Listeners\NotifyCustomer;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

/** Notifications par e-mail au client (D-039) : branchées sur les événements des autres modules. */
final class NotificationsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Event::listen(NotifyCustomer::EVENTS, NotifyCustomer::class);
    }
}
