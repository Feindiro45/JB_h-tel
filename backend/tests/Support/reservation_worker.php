<?php

/*
| Processus PHP indépendant lancé par ConcurrencyTest : il joue une « caissière » qui tente de
| réserver une chambre via le vrai service, avec sa propre connexion à la base.
| Entrée : argument 1 = JSON encodé en base64. Sortie : une ligne JSON {ok, id|code}.
*/

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\Services\ReservationBookingService;
use App\Modules\Reservations\DTO\OccupantData;
use App\Modules\Reservations\DTO\ReservationRequestData;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

/** @var array{room_id: int, customer_id: int, user_id: int, date: string, start_at?: float} $input */
$input = json_decode((string) base64_decode($argv[1] ?? ''), true, flags: JSON_THROW_ON_ERROR);

// Barrière : tous les processus d'une même course démarrent au même instant.
while (isset($input['start_at']) && microtime(true) < $input['start_at']) {
    usleep(200);
}

try {
    $reservation = app(ReservationBookingService::class)->create(new ReservationRequestData(
        roomId: $input['room_id'],
        customerId: $input['customer_id'],
        startDate: $input['date'],
        endDate: $input['date'],
        startTime: null,
        endTime: null,
        billingUnit: BillingUnit::Day,
        quantity: 1,
        occupants: [new OccupantData('Client concurrent', true)],
    ), User::query()->findOrFail($input['user_id']));

    echo json_encode(['ok' => true, 'id' => $reservation->uuid]);
} catch (BusinessRuleException $e) {
    echo json_encode(['ok' => false, 'code' => $e->errorCode()]);
}
