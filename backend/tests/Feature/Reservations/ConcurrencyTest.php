<?php

namespace Tests\Feature\Reservations;

use App\Modules\Customers\Models\Customer;
use App\Modules\Identity\Models\User;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use Database\Seeders\RolesAndPermissionsSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Database\Connection;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Recette 10 et critère d'acceptation : deux caissières qui réservent la même chambre au même
 * moment n'obtiennent qu'une seule confirmation.
 *
 * Ces tests lancent de **vrais processus PHP** (une connexion à la base chacun) : les données
 * doivent donc être réellement validées en base (DatabaseTruncation, pas de transaction de test).
 */
class ConcurrencyTest extends TestCase
{
    use DatabaseTruncation;

    private Room $room;

    private int $customerId;

    private int $userId;

    private string $date;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolesAndPermissionsSeeder::class, SettingsSeeder::class]);
        $type = RoomType::factory()->vip()->create();
        $this->room = Room::factory()->create(['number' => '101', 'room_type_id' => $type->id]);
        RoomRate::factory()->create(['room_type_id' => $type->id, 'billing_unit' => BillingUnit::Day, 'amount_fcfa' => 50000]);
        $this->customerId = Customer::factory()->create()->id;
        $this->userId = User::factory()->cashier()->create()->id;
        $this->date = now()->addDays(3)->toDateString();
    }

    protected function tearDown(): void
    {
        // Ne laisse aucune donnée validée aux classes de tests suivantes.
        $this->truncateTablesForAllConnections();
        parent::tearDown();
    }

    public function test_second_booking_waits_for_the_room_lock_then_sees_the_conflict(): void
    {
        $holder = $this->secondConnection();
        $holder->beginTransaction();
        // « Caissière A » est en train de confirmer : elle détient le verrou de la chambre.
        $holder->select('SELECT id FROM rooms WHERE id = ? FOR UPDATE', [$this->room->id]);

        [$process, $pipes] = $this->spawnWorker();
        $this->assertTrue(
            $this->waitUntil(fn () => $this->lockWaitCount() > 0, 20),
            'La « caissière B » aurait dû attendre le verrou de la chambre.',
        );

        $holder->table('reservations')->insert([
            'uuid' => (string) Str::uuid7(), 'customer_id' => $this->customerId, 'room_id' => $this->room->id,
            'start_date' => $this->date, 'end_date' => $this->date,
            'blocked_from' => $this->date.' 00:00:00', 'blocked_until' => now()->addDays(4)->toDateString().' 00:00:00',
            'period_is_estimated' => true, 'billing_unit' => 'DAY', 'quantity' => 1,
            'applied_unit_price_fcfa' => 50000, 'gross_fcfa' => 50000, 'discount_fcfa' => 0, 'net_fcfa' => 50000,
            'status' => 'CONFIRMED', 'created_by' => $this->userId, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $holder->commit();

        $result = $this->collect($process, $pipes);
        $this->assertSame(['ok' => false, 'code' => 'room_unavailable'], $result);
        $this->assertSame(1, DB::table('reservations')->count());
    }

    public function test_two_simultaneous_bookings_yield_a_single_confirmation(): void
    {
        $startAt = microtime(true) + 4.0;
        $workers = [$this->spawnWorker($startAt), $this->spawnWorker($startAt)];

        $results = array_map(fn (array $worker) => $this->collect(...$worker), $workers);
        $outcomes = array_map(fn (array $r) => $r['ok'] ? 'ok' : $r['code'], $results);
        sort($outcomes);

        $this->assertSame(['ok', 'room_unavailable'], $outcomes);
        $this->assertSame(1, DB::table('reservations')->where('room_id', $this->room->id)->count());
    }

    private function secondConnection(): Connection
    {
        $default = (string) config('database.default');
        config(['database.connections.lock_holder' => config("database.connections.{$default}")]);

        /** @var Connection $connection */
        $connection = DB::connection('lock_holder');

        return $connection;
    }

    private function lockWaitCount(): int
    {
        return (int) DB::selectOne("SELECT COUNT(*) AS n FROM information_schema.INNODB_TRX WHERE trx_state = 'LOCK WAIT'")->n;
    }

    /** @return array{0: resource, 1: array<int, resource>} */
    private function spawnWorker(?float $startAt = null): array
    {
        $input = ['room_id' => $this->room->id, 'customer_id' => $this->customerId, 'user_id' => $this->userId, 'date' => $this->date];
        if ($startAt !== null) {
            $input['start_at'] = $startAt;
        }
        $env = array_merge(getenv(), [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => (string) config('database.default'),
            'DB_DATABASE' => (string) config('database.connections.'.config('database.default').'.database'),
        ]);

        $process = proc_open(
            [PHP_BINARY, base_path('tests/Support/reservation_worker.php'), base64_encode((string) json_encode($input))],
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

    private function waitUntil(callable $condition, int $seconds): bool
    {
        $deadline = microtime(true) + $seconds;
        while (microtime(true) < $deadline) {
            if ($condition()) {
                return true;
            }
            usleep(100_000);
        }

        return false;
    }
}
