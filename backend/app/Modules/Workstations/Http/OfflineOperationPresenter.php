<?php

namespace App\Modules\Workstations\Http;

use App\Modules\Workstations\Models\OfflineOperation;

/** Représentation d'une opération rejouée (écran « Mode hors ligne » et export Excel). */
final class OfflineOperationPresenter
{
    /** @return array<string, mixed> */
    public static function present(OfflineOperation $o): array
    {
        return [
            'id' => $o->uuid,
            'kind' => $o->kind,
            'kind_label' => OfflineOperation::KIND_LABELS[$o->kind] ?? $o->kind,
            'label' => $o->label,
            'user' => $o->user?->name,
            'workstation' => $o->workstation?->name,
            'created_offline_at' => $o->created_offline_at?->toIso8601String(),
            'received_at' => $o->received_at->toIso8601String(),
            'attempts' => $o->attempts,
            'outcome' => $o->outcome,
            'outcome_label' => OfflineOperation::OUTCOME_LABELS[$o->outcome] ?? $o->outcome,
            'http_status' => $o->http_status,
            'reason_title' => $o->reason_title,
            'reason' => $o->reason,
            'reason_code' => $o->reason_code,
            'review_status' => $o->review_status,
            'review_label' => $o->review_status === null ? null : (OfflineOperation::REVIEW_LABELS[$o->review_status] ?? $o->review_status),
            'reviewed_by' => $o->reviewer?->name,
            'reviewed_at' => $o->reviewed_at?->toIso8601String(),
            'review_reason' => $o->review_reason,
        ];
    }
}
