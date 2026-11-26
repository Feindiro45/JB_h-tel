<?php

namespace Tests\Feature\Shared;

use App\Modules\Cashier\Models\Payment;
use App\Modules\Reservations\Models\Reservation;
use App\Shared\Idempotency\IdempotencyRecord;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Str;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * Lot 3 : deux envois simultanés du même encaissement (même clé) n'en enregistrent qu'un seul.
 * Le test lance de **vrais processus PHP** : les données doivent être validées en base
 * (DatabaseTruncation, pas de transaction de test), comme ConcurrencyTest.
 */
class IdempotencyConcurrencyTest extends TestCase
{
    use BuildsHotel, DatabaseTruncation;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();
        parent::tearDown();
    }

    public function test_two_simultaneous_sends_of_the_same_payment_record_it_once(): void
    {
        $this->buildHotel();
        $reservationUuid = $this->bookOk();
        $reservationId = (int) Reservation::query()->where('uuid', $reservationUuid)->value('id');
        $key = (string) Str::uuid();
        $startAt = microtime(true) + 1.5;

        $workers = [
            $this->spawn($reservationId, $key, $startAt),
            $this->spawn($reservationId, $key, $startAt),
        ];
        $results = array_map(fn (array $worker) => $this->collect(...$worker), $workers);

        $this->assertSame([201, 201], array_column($results, 'status'), json_encode($results, JSON_UNESCAPED_UNICODE) ?: '');
        $this->assertSame(['true'], array_values(array_filter(array_column($results, 'replayed'))));
        $this->assertSame($results[0]['body']['data']['receipt_number'], $results[1]['body']['data']['receipt_number']);
        $this->assertSame(1, Payment::query()->count());
        $this->assertSame(1, IdempotencyRecord::query()->count());
        // Le second envoi a bien attendu le premier sur l’index unique (pas un simple rejeu tardif).
        $replayed = array_values(array_filter($results, fn (array $r) => $r['replayed'] === 'true'))[0];
        $this->assertGreaterThanOrEqual(350, $replayed['elapsed_ms']);
    }

    /** @return array{0: resource, 1: array<int, resource>} */
    private function spawn(int $reservationId, string $key, float $startAt): array
    {
        $input = [
            'user_id' => $this->cashier->id,
            'reservation_id' => $reservationId,
            'key' => $key,
            'amount' => 20000,
            'hold_ms' => 400,
            'start_at' => $startAt,
        ];
        $env = array_merge(getenv(), [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => (string) config('database.default'),
            'DB_DATABASE' => (string) config('database.connections.'.config('database.default').'.database'),
        ]);
        $process = proc_open(
            [PHP_BINARY, base_path('tests/Support/idempotent_payment_worker.php'), base64_encode((string) json_encode($input))],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            base_path(),
            $env,
        );
        $this->assertIsResource($process, 'Impossible de lancer le processus concurrent.');

        return [$process, $pipes];
    }

    /**
     * @param  resource  $process
     * @param  array<int, resource>  $pipes
     * @return array<string, mixed>
     */
    private function collect($process, array $pipes): array
    {
        $output = (string) stream_get_contents($pipes[1]);
        $errors = (string) stream_get_contents($pipes[2]);
        proc_close($process);
        $decoded = json_decode(trim($output), true);
        $this->assertIsArray($decoded, "Sortie inattendue du processus concurrent : {$output} {$errors}");

        return $decoded;
    }
}
