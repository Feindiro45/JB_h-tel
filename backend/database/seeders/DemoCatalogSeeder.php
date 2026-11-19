<?php

namespace Database\Seeders;

use App\Modules\RoomCatalog\Application\Services\RateService;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\DTO\PublishRateData;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use Illuminate\Database\Seeder;

/**
 * Chambres et tarifs **de démonstration**, en local et en test uniquement. Les montants ne sont
 * PAS les tarifs de l'hôtel : ils reprennent les exemples de la recette (VIP à 50 000 FCFA).
 * Idempotent : rien n'est recréé ni modifié si les données existent déjà.
 */
class DemoCatalogSeeder extends Seeder
{
    /**
     * Attention : PHP convertit les clés « 101 » et « 201 » en entiers (pas « 001 ») ; d'où le
     * `(string)` lors de l'utilisation.
     *
     * @var array<int|string, array{type: string, capacity: int}>
     */
    public const ROOMS = [
        '001' => ['type' => 'STANDARD', 'capacity' => 1],
        '002' => ['type' => 'STANDARD', 'capacity' => 2],
        '101' => ['type' => 'VIP', 'capacity' => 2],
        '102' => ['type' => 'STANDARD', 'capacity' => 2],
        '201' => ['type' => 'VIP', 'capacity' => 3],
    ];

    /** @var array<string, array<string, int>> */
    public const RATES = [
        'VIP' => ['DAY' => 50000, 'HALF_DAY' => 30000],
        'STANDARD' => ['DAY' => 30000, 'HALF_DAY' => 20000],
    ];

    public function run(RateService $rates): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('Catalogue de démonstration ignoré hors environnement local.');

            return;
        }

        $types = RoomType::query()->get()->keyBy('code');

        foreach (self::ROOMS as $number => $room) {
            $type = $types->get($room['type']);
            if ($type === null) {
                continue;
            }
            Room::query()->firstOrCreate(
                ['number' => (string) $number],
                ['room_type_id' => $type->id, 'capacity' => $room['capacity']],
            );
        }

        foreach (self::RATES as $code => $amounts) {
            $type = $types->get($code);
            if ($type === null) {
                continue;
            }
            foreach ($amounts as $unit => $amount) {
                $billingUnit = BillingUnit::from($unit);
                if (RoomRate::query()->forChain($type->id, $billingUnit)->exists()) {
                    continue;
                }
                $rates->publish(new PublishRateData(
                    roomTypeId: $type->id,
                    billingUnit: $billingUnit,
                    amountFcfa: $amount,
                    reason: "Tarif de démonstration — à remplacer par les tarifs réels de l'hôtel",
                ));
            }
        }
    }
}
