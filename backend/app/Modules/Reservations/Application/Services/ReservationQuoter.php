<?php

namespace App\Modules\Reservations\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\ReservationQuote;
use App\Modules\Reservations\Domain\Billing\BillingUnitPolicies;
use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Domain\Contracts\RoomAvailability;
use App\Modules\Reservations\Domain\PriceCalculator;
use App\Modules\Reservations\DTO\ReservationRequestData;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Contracts\CurrentPriceProvider;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Modules\RoomCatalog\Contracts\RoomSnapshot;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\Format;

/**
 * Calcule un devis : période bloquée, capacité, règle de durée de l'unité, tarif en vigueur,
 * remise autorisée et conflits. Utilisé tel quel par l'écran de réservation (sans écriture) et,
 * sous verrou, par la création.
 */
final class ReservationQuoter
{
    public function __construct(
        private readonly RoomDirectory $rooms,
        private readonly CurrentPriceProvider $prices,
        private readonly BillingUnitPolicies $policies,
        private readonly PriceCalculator $calculator,
        private readonly DiscountAuthorizer $discounts,
        private readonly RoomAvailability $availability,
    ) {}

    public function quote(ReservationRequestData $data, User $actor, ?RoomSnapshot $room = null, ?int $exceptReservationId = null): ReservationQuote
    {
        $room ??= $this->rooms->find($data->roomId) ?? throw self::roomNotFound();
        $period = $data->period();
        self::assertValidPeriod($period);
        self::assertCapacity($room, count($data->occupants));

        $rate = $this->prices->currentRate($room->roomTypeId, $data->billingUnit);
        $this->assertDuration($data->billingUnit, $data->quantity, $period, $rate->amountFcfa);

        $price = $this->calculator->compute($rate->amountFcfa, $data->quantity, $data->discount);
        $this->discounts->authorize($actor, $price);

        $conflicts = $this->availability->conflicts($room->id, $period->from, $period->until, $exceptReservationId);

        return new ReservationQuote($room, $period, $data->billingUnit, $rate, $price, $conflicts);
    }

    /**
     * Demi-journée (D-007) : si la durée connue dépasse la couverture, l'opération est bloquée.
     * La caissière doit valider explicitement le supplément (quantité augmentée) ; aucune
     * conversion automatique en journée.
     */
    public function assertDuration(BillingUnit $unit, int $quantity, BlockedPeriod $period, int $unitPriceFcfa): void
    {
        $policy = $this->policies->for($unit);
        $maxMinutes = $policy->maxCoveredMinutes($quantity);
        if ($maxMinutes === null || $period->estimated || $period->minutes() <= $maxMinutes) {
            return;
        }

        $needed = (int) $policy->requiredQuantity($period->minutes());
        $unitLabel = mb_strtolower($unit->label());
        throw new BusinessRuleException(
            "La période dépasse la durée couverte par {$quantity} {$unitLabel}(s). Aucune conversion automatique n'est faite : "
                ."validez explicitement le supplément en portant la quantité à {$needed}, ou choisissez une autre unité.",
            'Dépassement de la demi-journée',
            422,
            'half_day_overrun',
            [
                'Durée de la période : '.self::duration($period->minutes()).'.',
                'Durée couverte : '.self::duration($maxMinutes)." ({$quantity} {$unitLabel}(s)).",
                "Quantité nécessaire : {$needed}.",
                'Supplément proposé : +'.Format::fcfa(($needed - $quantity) * $unitPriceFcfa)
                    .' (brut '.Format::fcfa($needed * $unitPriceFcfa).').',
            ],
        );
    }

    public static function assertValidPeriod(BlockedPeriod $period): void
    {
        if (! $period->isValid()) {
            throw new BusinessRuleException(
                "La fin du séjour doit être postérieure à son début. Vérifiez les dates et les heures d'arrivée et de départ.",
                'Période invalide',
                422,
                'invalid_period',
            );
        }
    }

    public static function assertCapacity(RoomSnapshot $room, int $occupants): void
    {
        if ($occupants > $room->capacity) {
            throw new BusinessRuleException(
                "La chambre {$room->number} accepte au maximum {$room->capacity} occupant(s) : {$occupants} ont été saisis. "
                    .'Choisissez une chambre plus grande ou réduisez le nombre d’occupants.',
                'Capacité dépassée',
                422,
                'capacity_exceeded',
            );
        }
    }

    public static function roomNotFound(): BusinessRuleException
    {
        return new BusinessRuleException("La chambre demandée n'existe pas.", 'Chambre introuvable', 404, 'room_not_found');
    }

    private static function duration(int $minutes): string
    {
        $hours = intdiv($minutes, 60);
        $rest = $minutes % 60;

        return $rest === 0 ? "{$hours} h" : sprintf('%d h %02d', $hours, $rest);
    }
}
