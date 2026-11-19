<?php

namespace App\Modules\RoomCatalog\Contracts;

use App\Shared\Exceptions\BusinessRuleException;
use Carbon\CarbonInterface;

/**
 * Tarif à appliquer. Règle 02 (invariant 3) : c'est la version **active au moment de la
 * confirmation** qui est figée sur la réservation, et non celle de la date du séjour.
 */
interface CurrentPriceProvider
{
    /**
     * @param  CarbonInterface|null  $at  Instant de référence ; par défaut, maintenant.
     *
     * @throws BusinessRuleException code `rate_not_defined` (409) si aucune version n'est en vigueur.
     */
    public function currentRate(int $roomTypeId, BillingUnit $unit, ?CarbonInterface $at = null): AppliedRate;
}
