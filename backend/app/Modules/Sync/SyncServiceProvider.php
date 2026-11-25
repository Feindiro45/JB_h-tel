<?php

namespace App\Modules\Sync;

use App\Modules\Sync\Application\Listeners\RecordModelChange;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

/**
 * Journal des changements pour la synchronisation des postes (D-069). Écoute les événements
 * Eloquent de toutes les données (filtrées par table dans `SyncEntity`), sans dépendre des
 * autres modules.
 */
final class SyncServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Event::listen(
            ['eloquent.created: *', 'eloquent.updated: *', 'eloquent.deleted: *'],
            [RecordModelChange::class, 'handle'],
        );
    }
}
