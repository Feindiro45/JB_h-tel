<?php

namespace App\Modules\Reservations\Domain;

use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\Format;

/**
 * Calcul du prix : brut = prix unitaire × quantité (prix par chambre, indépendant du nombre
 * d'occupants) ; remise ; net = brut − remise. Entiers uniquement.
 *
 * Remise en pourcentage arrondie au FCFA le plus proche, demi supérieur (D-008, provisoire, Q-05).
 */
final class PriceCalculator
{
    public function compute(int $unitPriceFcfa, int $quantity, ?Discount $discount): PriceBreakdown
    {
        $gross = $unitPriceFcfa * $quantity;
        $discountFcfa = 0;

        if ($discount !== null) {
            $discountFcfa = $discount->type === DiscountType::Percent
                ? intdiv($gross * $discount->value + 5000, 10000)
                : $discount->value;

            if ($discountFcfa > $gross) {
                throw new BusinessRuleException(
                    'La réduction ('.Format::fcfa($discountFcfa).') dépasse le montant brut ('.Format::fcfa($gross).').',
                    'Réduction invalide',
                    422,
                    'discount_exceeds_amount',
                );
            }
        }

        return new PriceBreakdown($unitPriceFcfa, $quantity, $gross, $discount, $discountFcfa, $gross - $discountFcfa);
    }
}
