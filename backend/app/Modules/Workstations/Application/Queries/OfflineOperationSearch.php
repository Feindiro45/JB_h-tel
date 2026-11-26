<?php

namespace App\Modules\Workstations\Application\Queries;

use App\Modules\Workstations\DTO\OfflineOperationFilters;
use App\Modules\Workstations\Models\OfflineOperation;
use Illuminate\Database\Eloquent\Builder;

/** Opérations rejouées (journal du serveur), la plus récente d'abord : écran et export Excel. */
final class OfflineOperationSearch
{
    /** @return Builder<OfflineOperation> */
    public function query(OfflineOperationFilters $filters): Builder
    {
        return OfflineOperation::query()
            ->with(['user', 'workstation', 'reviewer'])
            ->when($filters->outcome !== null, fn (Builder $q) => $q->where('outcome', $filters->outcome))
            ->when($filters->review !== null, fn (Builder $q) => $q->where('review_status', $filters->review))
            ->when($filters->search !== null, function (Builder $q) use ($filters): void {
                $term = '%'.addcslashes((string) $filters->search, '%_\\').'%';
                $q->where(fn (Builder $w) => $w->where('label', 'like', $term)->orWhere('reason', 'like', $term));
            })
            ->orderByDesc('received_at')
            ->orderByDesc('id');
    }
}
