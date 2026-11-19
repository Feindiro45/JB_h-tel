<?php

namespace App\Modules\RoomCatalog\Application\Services;

use App\Modules\RoomCatalog\DTO\PublishRateData;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Versions tarifaires (cahier des charges, « Tarifs historiques »).
 *
 * - Publier ajoute une version ; la version précédente reçoit pour date de fin la date d'effet de
 *   la nouvelle. **Aucun montant existant n'est jamais modifié** : les réservations et factures
 *   déjà enregistrées gardent leur prix.
 * - Une date d'effet passée est refusée : le passé ne se réécrit pas.
 * - Une version insérée avant une version déjà programmée se termine au début de celle-ci,
 *   de sorte que la chaîne reste continue et sans chevauchement.
 * - Les publications sur un même type de chambre sont sérialisées par un verrou.
 */
final class RateService
{
    /** Tolérance pour une date d'effet « maintenant » transmise par l'interface. */
    private const PAST_TOLERANCE_SECONDS = 60;

    public function __construct(private readonly AuditTrail $audit) {}

    public function publish(PublishRateData $data): RoomRate
    {
        return DB::transaction(function () use ($data): RoomRate {
            RoomType::query()->whereKey($data->roomTypeId)->lockForUpdate()->firstOrFail();

            $now = CarbonImmutable::now();
            $from = ($data->effectiveFrom ?? $now)->setMicrosecond(0);
            if ($from->lt($now->subSeconds(self::PAST_TOLERANCE_SECONDS))) {
                throw new BusinessRuleException(
                    "La date d'effet est passée. Un tarif ne peut s'appliquer qu'à partir de maintenant ou d'une date future.",
                    'Date d’effet invalide',
                    422,
                    'rate_in_past',
                );
            }

            $versions = RoomRate::query()
                ->forChain($data->roomTypeId, $data->billingUnit)
                ->orderBy('effective_from')
                ->lockForUpdate()
                ->get();

            if ($versions->contains(fn (RoomRate $version) => $version->effective_from->equalTo($from))) {
                throw new BusinessRuleException(
                    "Une version de ce tarif commence déjà à cette date. Choisissez une autre date d'effet ou retirez la version programmée.",
                    'Version déjà programmée',
                    409,
                    'rate_version_conflict',
                );
            }

            $previous = $versions->filter(fn (RoomRate $version) => $version->effective_from->lt($from))->last();
            $next = $versions->first(fn (RoomRate $version) => $version->effective_from->gt($from));
            $before = $previous === null ? null : $this->snapshot($previous);

            if ($previous !== null) {
                $previous->setAttribute('effective_to', $from);
                $previous->save();
            }

            $rate = RoomRate::query()->create([
                'room_type_id' => $data->roomTypeId,
                'billing_unit' => $data->billingUnit,
                'amount_fcfa' => $data->amountFcfa,
                'effective_from' => $from,
                'effective_to' => $next?->effective_from,
                'reason' => $data->reason,
                'created_by' => auth()->id(),
            ]);

            $this->audit->record('rate.published', 'room_rate', $rate->id, $before, $this->snapshot($rate));

            return $rate;
        });
    }

    /**
     * Retire une version **programmée** qui n'est pas encore entrée en vigueur. Elle n'a donc
     * jamais été appliquée à une réservation. La version précédente est prolongée d'autant.
     */
    public function withdraw(RoomRate $rate): void
    {
        DB::transaction(function () use ($rate): void {
            RoomType::query()->whereKey($rate->room_type_id)->lockForUpdate()->firstOrFail();
            /** @var RoomRate $rate */
            $rate = RoomRate::query()->lockForUpdate()->findOrFail($rate->id);

            if ($rate->effective_from->lte(CarbonImmutable::now())) {
                throw new BusinessRuleException(
                    'Ce tarif est déjà entré en vigueur : il ne peut plus être retiré. Publiez une nouvelle version.',
                    'Retrait impossible',
                    409,
                    'rate_already_effective',
                );
            }

            $previous = RoomRate::query()
                ->forChain($rate->room_type_id, $rate->billing_unit)
                ->where('effective_to', $rate->effective_from)
                ->lockForUpdate()
                ->first();
            if ($previous !== null) {
                $previous->effective_to = $rate->effective_to;
                $previous->save();
            }

            $snapshot = $this->snapshot($rate);
            $rate->delete();

            $this->audit->record('rate.withdrawn', 'room_rate', $rate->id, $snapshot);
        });
    }

    /** @return array<string, int|string|null> */
    private function snapshot(RoomRate $rate): array
    {
        return [
            'id' => $rate->id,
            'room_type_id' => $rate->room_type_id,
            'billing_unit' => $rate->billing_unit->value,
            'amount_fcfa' => $rate->amount_fcfa,
            'effective_from' => $rate->effective_from->toDateTimeString(),
            'effective_to' => $rate->effective_to?->toDateTimeString(),
            'reason' => $rate->reason,
        ];
    }
}
