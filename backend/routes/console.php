<?php

use App\Shared\Idempotency\IdempotencyRecord;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Réponses mémorisées des écritures idempotentes (lot 3) : purgées après 30 jours.
// Nécessite la tâche cron « php artisan schedule:run » sur le serveur.
Schedule::command('model:prune', ['--model' => [IdempotencyRecord::class]])->daily();
