<?php

namespace App\Modules\Reservations\Domain\Billing;

use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Shared\Settings\SettingsRepository;

/** Registre des stratégies par unité de facturation. */
final class BillingUnitPolicies
{
    public function __construct(private readonly SettingsRepository $settings) {}

    public function for(BillingUnit $unit): BillingUnitPolicy
    {
        return match ($unit) {
            BillingUnit::HalfDay => new HalfDayPolicy(max(1, $this->settings->int('billing.half_day_max_hours', 12))),
            BillingUnit::Day => new DayPolicy,
        };
    }
}
