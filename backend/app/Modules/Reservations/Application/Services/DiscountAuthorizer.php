<?php

namespace App\Modules\Reservations\Application\Services;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Domain\PriceBreakdown;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Settings\SettingsRepository;

/**
 * Réductions : permission `discounts.apply` requise ; au-delà du plafond de délégation
 * (`discounts.cashier_max_percent`, 10 % provisoire, D-016), permission `discounts.override_cap`.
 */
final class DiscountAuthorizer
{
    public function __construct(private readonly SettingsRepository $settings) {}

    public function authorize(User $actor, PriceBreakdown $price): void
    {
        if ($price->discount === null) {
            return;
        }

        if (! $actor->hasPermissionTo(PermissionName::DiscountsApply->value)) {
            throw new BusinessRuleException(
                "Vous n'êtes pas autorisé à appliquer une réduction.",
                'Réduction refusée',
                403,
                'discount_not_allowed',
            );
        }

        $capPercent = $this->settings->int('discounts.cashier_max_percent', 10);
        $exceedsCap = $price->discountFcfa * 100 > $price->grossFcfa * $capPercent;

        if ($exceedsCap && ! $actor->hasPermissionTo(PermissionName::DiscountsOverrideCap->value)) {
            throw new BusinessRuleException(
                "La réduction ({$price->discount->describe()}) dépasse votre plafond autorisé de {$capPercent} % du montant brut. Demandez à un administrateur de l'appliquer.",
                'Réduction hors plafond',
                403,
                'discount_cap_exceeded',
            );
        }
    }
}
