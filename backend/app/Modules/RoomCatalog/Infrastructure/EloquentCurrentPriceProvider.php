<?php

namespace App\Modules\RoomCatalog\Infrastructure;

use App\Modules\RoomCatalog\Contracts\AppliedRate;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Contracts\CurrentPriceProvider;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Shared\Exceptions\BusinessRuleException;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

final class EloquentCurrentPriceProvider implements CurrentPriceProvider
{
    public function currentRate(int $roomTypeId, BillingUnit $unit, ?CarbonInterface $at = null): AppliedRate
    {
        $rate = RoomRate::query()
            ->forChain($roomTypeId, $unit)
            ->activeAt($at ?? CarbonImmutable::now())
            ->first();

        if ($rate === null) {
            throw new BusinessRuleException(
                "Aucun tarif « {$unit->label()} » n'est en vigueur pour ce type de chambre. Demandez à l'administrateur de le publier.",
                'Tarif manquant',
                409,
                'rate_not_defined',
            );
        }

        return new AppliedRate(
            rateId: $rate->id,
            roomTypeId: $rate->room_type_id,
            billingUnit: $rate->billing_unit,
            amountFcfa: $rate->amount_fcfa,
            effectiveFrom: $rate->effective_from->toImmutable(),
        );
    }
}
