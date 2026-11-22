<?php

namespace App\Modules\Workstations\Http;

use App\Modules\Workstations\Application\Services\WorkstationService;
use App\Modules\Workstations\Models\Workstation;
use App\Modules\Workstations\Models\WorkstationAssignment;

/**
 * Représentation JSON des postes (identifiants publics UUID, jamais le jeton ni son empreinte).
 */
final class WorkstationPresenter
{
    public function __construct(private readonly WorkstationService $service) {}

    /**
     * État vu par le navigateur courant : son nom, son rôle et la règle en vigueur.
     *
     * @return array<string, mixed>
     */
    public function self(Workstation $workstation): array
    {
        $current = WorkstationAssignment::current();
        $main = $current === null ? null : Workstation::query()->find($current->workstation_id);

        return [
            'id' => $workstation->uuid,
            'name' => $workstation->name,
            'is_main' => $main?->id === $workstation->id,
            'revoked' => $workstation->isRevoked(),
            'main' => $main === null ? null : ['name' => $main->name, 'silent' => $this->service->isSilent($main)],
            'enforce_main_post' => $this->service->enforcesMainPost(),
            'offline_rules' => $this->service->offlineRules(),
        ];
    }

    /**
     * État déclaré par un poste avec son signal de présence (lot 4A).
     *
     * @return array<string, mixed>
     */
    public function report(Workstation $workstation): array
    {
        return [
            'pending_operations' => $workstation->pending_operations,
            'rejected_operations' => $workstation->rejected_operations,
            'oldest_pending_at' => $workstation->oldest_pending_at?->toIso8601String(),
            'last_sync_at' => $workstation->last_sync_at?->toIso8601String(),
            'last_sync_status' => $workstation->last_sync_status,
            'last_backup_at' => $workstation->last_backup_at?->toIso8601String(),
            'storage_persisted' => $workstation->storage_persisted,
            'reported_at' => $workstation->reported_at?->toIso8601String(),
        ];
    }

    /**
     * Vue d'administration : postes, poste principal, historique des désignations et règles.
     *
     * @return array<string, mixed>
     */
    public function overview(?Workstation $self): array
    {
        $current = WorkstationAssignment::query()->with(['workstation', 'assignedBy'])->orderByDesc('number')->first();
        $workstations = Workstation::query()
            ->with(['registeredBy', 'lastSeenBy'])
            ->orderByRaw('revoked_at IS NULL DESC')
            ->orderByDesc('last_seen_at')
            ->orderBy('id')
            ->get();
        $assignments = WorkstationAssignment::query()
            ->with(['workstation', 'previousWorkstation', 'assignedBy'])
            ->orderByDesc('number')
            ->limit(30)
            ->get();
        $main = $current?->workstation;

        return [
            'main' => $main === null ? null : [
                'id' => $main->uuid,
                'name' => $main->name,
                'last_seen_at' => $main->last_seen_at?->toIso8601String(),
                'silent' => $this->service->isSilent($main),
                'assignment_number' => $current->number,
                'assigned_at' => $current->assigned_at->toIso8601String(),
                'assigned_by' => $current->assignedBy?->name,
            ],
            'settings' => [
                'enforce_main_post' => $this->service->enforcesMainPost(),
                'silent_after_minutes' => $this->service->silentAfterMinutes(),
            ],
            'workstations' => $workstations->map(fn (Workstation $w) => [
                'id' => $w->uuid,
                'name' => $w->name,
                'user_agent' => $w->user_agent,
                'registered_at' => $w->created_at->toIso8601String(),
                'registered_by' => $w->registeredBy?->name,
                'last_seen_at' => $w->last_seen_at?->toIso8601String(),
                'last_seen_by' => $w->lastSeenBy?->name,
                'silent' => $this->service->isSilent($w),
                'revoked_at' => $w->revoked_at?->toIso8601String(),
                'revocation_reason' => $w->revocation_reason,
                'is_main' => $main?->id === $w->id,
                'is_current' => $self?->id === $w->id,
            ])->all(),
            'assignments' => $assignments->map(fn (WorkstationAssignment $a) => [
                'id' => $a->uuid,
                'number' => $a->number,
                'mode' => $a->mode,
                'mode_label' => WorkstationAssignment::MODE_LABELS[$a->mode] ?? $a->mode,
                'workstation' => $a->workstation?->name,
                'previous_workstation' => $a->previousWorkstation?->name,
                'reason' => $a->reason,
                'previous_last_seen_at' => $a->previous_last_seen_at?->toIso8601String(),
                'assigned_by' => $a->assignedBy?->name,
                'assigned_at' => $a->assigned_at->toIso8601String(),
            ])->all(),
        ];
    }
}
