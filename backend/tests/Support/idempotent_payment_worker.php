<?php

/*
| Processus PHP indépendant lancé par IdempotencyConcurrencyTest : il joue une caissière qui
| envoie un encaissement avec une clé Idempotency-Key, à travers le vrai middleware et le vrai
| service de caisse, avec sa propre connexion à la base.
| Entrée : argument 1 = JSON encodé en base64. Sortie : une ligne JSON {status, replayed, body}.
*/

use App\Modules\Cashier\Application\Services\CashierService;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Shared\Http\Middleware\EnsureIdempotency;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

/** @var array{user_id: int, reservation_id: int, key: string, amount: int, hold_ms: int, start_at: float} $input */
$input = json_decode((string) base64_decode($argv[1] ?? ''), true, flags: JSON_THROW_ON_ERROR);

// Barrière : les deux processus démarrent au même instant.
while (microtime(true) < $input['start_at']) {
    usleep(200);
}

$user = User::query()->findOrFail($input['user_id']);
$request = Request::create(
    '/api/v1/reservations/concurrence/payments', 'POST', [], [], [],
    ['CONTENT_TYPE' => 'application/json', 'HTTP_IDEMPOTENCY_KEY' => $input['key']],
    (string) json_encode(['amount_fcfa' => $input['amount'], 'method' => 'CASH']),
);
$request->setUserResolver(fn () => $user);

$response = app(EnsureIdempotency::class)->handle($request, function () use ($input, $user): JsonResponse {
    // La clé est déjà posée dans la transaction : on la garde ouverte pour forcer la course.
    usleep($input['hold_ms'] * 1000);
    $due = app(ReservationLedger::class)->find($input['reservation_id']) ?? throw new RuntimeException('Réservation absente');
    $payment = app(CashierService::class)->record($due, $input['amount'], 'CASH', null, $user);

    return new JsonResponse(['data' => ['id' => $payment->uuid, 'receipt_number' => $payment->receipt_number]], 201);
});

echo json_encode([
    // Durée depuis le départ commun : le rejeu par attente sur l’index unique dure au moins la pause.
    'elapsed_ms' => (int) round((microtime(true) - $input['start_at']) * 1000),
    'status' => $response->getStatusCode(),
    'replayed' => $response->headers->get('Idempotent-Replayed'),
    'body' => json_decode((string) $response->getContent(), true),
]);
