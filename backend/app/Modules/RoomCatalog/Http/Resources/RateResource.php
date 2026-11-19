<?php

namespace App\Modules\RoomCatalog\Http\Resources;

use App\Modules\RoomCatalog\Application\Queries\RateHistoryEntry;
use App\Modules\RoomCatalog\Domain\RateStatus;
use App\Modules\RoomCatalog\Models\RoomRate;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Version tarifaire. Accepte un `RateHistoryEntry` (historique, avec l'ancien tarif) ou un
 * `RoomRate` seul (publication).
 */
final class RateResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $entry = $this->resource;
        $rate = $entry instanceof RateHistoryEntry ? $entry->rate : $entry;
        assert($rate instanceof RoomRate);
        $status = $entry instanceof RateHistoryEntry ? $entry->status : $rate->statusAt(CarbonImmutable::now());

        return [
            'id' => $rate->uuid,
            'room_type' => $rate->relationLoaded('roomType') ? [
                'id' => $rate->roomType->uuid,
                'code' => $rate->roomType->code,
                'label' => $rate->roomType->label,
            ] : null,
            'billing_unit' => $rate->billing_unit->value,
            'billing_unit_label' => $rate->billing_unit->label(),
            'amount_fcfa' => $rate->amount_fcfa,
            'previous_amount_fcfa' => $entry instanceof RateHistoryEntry ? $entry->previousAmountFcfa : null,
            'effective_from' => $rate->effective_from->toIso8601String(),
            'effective_to' => $rate->effective_to?->toIso8601String(),
            'status' => $status->value,
            'status_label' => $status->label(),
            'withdrawable' => $status === RateStatus::Scheduled,
            'reason' => $rate->reason,
            'created_by' => $rate->relationLoaded('creator') && $rate->creator !== null
                ? ['id' => $rate->creator->uuid, 'name' => $rate->creator->name]
                : null,
        ];
    }
}
