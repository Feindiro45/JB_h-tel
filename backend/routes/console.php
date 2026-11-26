<?php

use App\Modules\Sync\Models\SyncChange;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// D-067 : ne pas purger les identités d'opérations ; une ancienne sauvegarde peut être rejouée.

// D-069 : le journal des changements des postes est gardé jbhotel.sync.retention_days jours.
Schedule::command('model:prune', ['--model' => [SyncChange::class]])->daily();
