<?php

namespace App\Modules\RoomCatalog\Application\Queries;

use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use Carbon\CarbonImmutable;

/**
 * Historique des tarifs : pour chaque version, l'ancien tarif (version précédente de la même
 * chaîne), le nouveau, l'auteur, la date d'effet, le motif et le statut au moment présent.
 */
final class RateHistory
{
    /** @return list<RateHistoryEntry> Du plus récent au plus ancien. */
    public function entries(?int $roomTypeId = null, ?BillingUnit $unit = null): array
    {
        $now = CarbonImmutable::now();
        $rates = RoomRate::query()
            ->with(['roomType', 'creator'])
            ->when($roomTypeId !== null, fn ($query) => $query->where('room_type_id', $roomTypeId))
            ->when($unit !== null, fn ($query) => $query->where('billing_unit', $unit?->value))
            ->orderBy('room_type_id')
            ->orderBy('billing_unit')
            ->orderBy('effective_from')
            ->get();

        $entries = [];
        $lastByChain = [];
        foreach ($rates as $rate) {
            $chain = $rate->room_type_id.'|'.$rate->billing_unit->value;
            $entries[] = new RateHistoryEntry($rate, $lastByChain[$chain] ?? null, $rate->statusAt($now));
            $lastByChain[$chain] = $rate->amount_fcfa;
        }

        usort($entries, fn (RateHistoryEntry $a, RateHistoryEntry $b) => $b->rate->effective_from <=> $a->rate->effective_from
            ?: $b->rate->id <=> $a->rate->id);

        return $entries;
    }

    /**
     * Grille des tarifs : pour chaque type de chambre et chaque unité, la version en vigueur et
     * la prochaine version programmée.
     *
     * @return list<array{room_type: RoomType, rates: array<string, array{current: RoomRate|null, next: RoomRate|null}>}>
     */
    public function grid(): array
    {
        $now = CarbonImmutable::now();
        $types = RoomType::query()->orderBy('id')->get();
        $rates = RoomRate::query()
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhere('effective_to', '>', $now))
            ->orderBy('effective_from')
            ->get()
            ->groupBy(fn (RoomRate $rate) => $rate->room_type_id.'|'.$rate->billing_unit->value);

        $grid = [];
        foreach ($types as $type) {
            $row = ['room_type' => $type, 'rates' => []];
            foreach (BillingUnit::cases() as $unit) {
                $chain = $rates->get($type->id.'|'.$unit->value, collect());
                $row['rates'][$unit->value] = [
                    'current' => $chain->first(fn (RoomRate $rate) => $rate->effective_from->lte($now)),
                    'next' => $chain->first(fn (RoomRate $rate) => $rate->effective_from->gt($now)),
                ];
            }
            $grid[] = $row;
        }

        return $grid;
    }
}
