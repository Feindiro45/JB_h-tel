<?php

namespace App\Modules\Workstations\Http\Controllers;

use App\Modules\Identity\Models\User;
use App\Modules\Workstations\Application\Queries\OfflineOperationSearch;
use App\Modules\Workstations\Application\Services\OfflineJournal;
use App\Modules\Workstations\Application\Services\WorkstationService;
use App\Modules\Workstations\Http\OfflineOperationPresenter;
use App\Modules\Workstations\Http\Requests\OfflineOperationsRequest;
use App\Modules\Workstations\Http\WorkstationPresenter;
use App\Modules\Workstations\Models\OfflineOperation;
use App\Modules\Workstations\Models\Workstation;
use App\Modules\Workstations\Models\WorkstationAssignment;
use App\Shared\Http\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Module administrateur « Mode hors ligne » (lot 4A) : état du poste principal et des autres postes,
 * chiffres du jour, centre de synchronisation (opérations reçues, doublons, refus à examiner).
 */
final class OfflineController
{
    public function __construct(
        private readonly WorkstationService $workstations,
        private readonly WorkstationPresenter $presenter,
        private readonly OfflineJournal $journal,
    ) {}

    public function overview(): JsonResponse
    {
        $current = WorkstationAssignment::current();
        $mainId = $current?->workstation_id;
        $stations = Workstation::query()
            ->with('lastSeenBy')
            ->whereNull('revoked_at')
            ->orderByDesc('last_seen_at')
            ->get();
        $startOfDay = now()->startOfDay();
        $today = OfflineOperation::query()
            ->where('received_at', '>=', $startOfDay)
            ->selectRaw('outcome, COUNT(*) AS total')
            ->groupBy('outcome')
            ->pluck('total', 'outcome');

        return new JsonResponse(['data' => [
            'main' => $mainId === null ? null : $this->station($stations->firstWhere('id', $mainId) ?? Workstation::query()->find($mainId)),
            'workstations' => $stations->map(fn (Workstation $w) => $this->station($w))->values()->all(),
            'silent_after_minutes' => $this->workstations->silentAfterMinutes(),
            'today' => [
                'accepted' => (int) ($today[OfflineOperation::ACCEPTED] ?? 0),
                'duplicates' => (int) ($today[OfflineOperation::DUPLICATE] ?? 0),
                'rejected' => (int) ($today[OfflineOperation::REJECTED] ?? 0),
            ],
            'to_review' => OfflineOperation::query()->where('review_status', OfflineOperation::TO_REVIEW)->count(),
            'rules' => $this->workstations->offlineRules(),
        ]]);
    }

    /** Centre de synchronisation : filtres par résultat, examen et recherche. */
    public function operations(OfflineOperationsRequest $request, OfflineOperationSearch $search): JsonResponse
    {
        $page = $search->query($request->toData())
            ->paginate(PerPage::from($request))
            ->withQueryString();

        return new JsonResponse([
            'data' => array_map(fn (OfflineOperation $o) => OfflineOperationPresenter::present($o), $page->items()),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    public function review(Request $request, OfflineOperation $offlineOperation): JsonResponse
    {
        $validated = $request->validate([
            'resolution' => ['required', Rule::in([OfflineOperation::REENTERED, OfflineOperation::REJECTION_CONFIRMED])],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ], [], ['resolution' => 'décision', 'reason' => 'motif']);
        /** @var User $actor */
        $actor = $request->user();
        $operation = $this->journal->review($offlineOperation, $validated['resolution'], trim($validated['reason']), $actor);

        return new JsonResponse(['data' => OfflineOperationPresenter::present($operation->load(['user', 'workstation', 'reviewer']))]);
    }

    /** @return array<string, mixed> */
    private function station(?Workstation $workstation): ?array
    {
        if ($workstation === null) {
            return null;
        }

        return [
            'id' => $workstation->uuid,
            'name' => $workstation->name,
            'is_main' => WorkstationAssignment::current()?->workstation_id === $workstation->id,
            'silent' => $this->workstations->isSilent($workstation),
            'last_seen_at' => $workstation->last_seen_at?->toIso8601String(),
            'last_seen_by' => $workstation->lastSeenBy?->name,
            'report' => $this->presenter->report($workstation),
        ];
    }
}
