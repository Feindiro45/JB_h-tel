<?php

namespace Tests\Feature\Database;

use App\Modules\Identity\Models\User;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Les invariants critiques sont aussi garantis par la base (contraintes CHECK, clés étrangères,
 * unicité) : même une écriture qui contournerait les services ne peut pas les violer.
 * Chaque insertion porte un UUID valide, pour qu'un refus vienne bien de la règle testée.
 */
class SchemaConstraintsTest extends TestCase
{
    use RefreshDatabase;

    private int $userId;

    private int $typeId;

    private int $roomId;

    private int $customerId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->userId = User::factory()->create()->id;
        $this->typeId = DB::table('room_types')->insertGetId($this->row(['code' => 'VIP', 'label' => 'VIP']));
        $this->roomId = DB::table('rooms')->insertGetId($this->row(['number' => '101', 'room_type_id' => $this->typeId, 'capacity' => 2]));
        $this->customerId = DB::table('customers')->insertGetId($this->row(['name' => 'Ngaïkosset']));
    }

    /**
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private function row(array $values): array
    {
        return array_merge(['uuid' => (string) Str::uuid7(), 'created_at' => now(), 'updated_at' => now()], $values);
    }

    /** @param  array<string, mixed>  $overrides */
    private function insertReservation(array $overrides = []): int
    {
        return DB::table('reservations')->insertGetId($this->row(array_merge([
            'customer_id' => $this->customerId,
            'room_id' => $this->roomId,
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-01',
            'blocked_from' => '2026-12-01 00:00:00',
            'blocked_until' => '2026-12-02 00:00:00',
            'billing_unit' => 'DAY',
            'quantity' => 1,
            'applied_unit_price_fcfa' => 50000,
            'gross_fcfa' => 50000,
            'discount_fcfa' => 0,
            'net_fcfa' => 50000,
            'status' => 'CONFIRMED',
            'created_by' => $this->userId,
        ], $overrides)));
    }

    private function assertRejected(Closure $write): void
    {
        try {
            $write();
        } catch (QueryException) {
            $this->addToAssertionCount(1);

            return;
        }
        $this->fail('L’écriture invalide aurait dû être refusée par la base.');
    }

    public function test_valid_reservation_with_ten_percent_discount_is_accepted(): void
    {
        // 50 000 − 10 % = 45 000 (critère d'acceptation de la fiche 06).
        $this->insertReservation([
            'discount_type' => 'PERCENT', 'discount_value' => 10, 'discount_fcfa' => 5000, 'net_fcfa' => 45000,
        ]);

        $this->assertSame(1, DB::table('reservations')->count());
    }

    public function test_reservation_amount_invariants_are_enforced(): void
    {
        $this->assertRejected(fn () => $this->insertReservation(['net_fcfa' => 40000]));
        $this->assertRejected(fn () => $this->insertReservation(['discount_fcfa' => 60000, 'net_fcfa' => 0]));
        $this->assertRejected(fn () => $this->insertReservation(['discount_type' => 'PERCENT', 'discount_value' => 150]));
        $this->assertRejected(fn () => $this->insertReservation(['discount_type' => 'PERCENT', 'discount_value' => null]));
        $this->assertRejected(fn () => $this->insertReservation(['quantity' => 0]));
    }

    public function test_reservation_period_status_and_unit_are_enforced(): void
    {
        $this->assertRejected(fn () => $this->insertReservation(['end_date' => '2026-11-30']));
        $this->assertRejected(fn () => $this->insertReservation(['blocked_until' => '2026-12-01 00:00:00']));
        $this->assertRejected(fn () => $this->insertReservation(['status' => 'PAYEE']));
        $this->assertRejected(fn () => $this->insertReservation(['billing_unit' => 'HOUR']));
    }

    public function test_room_number_is_unique_and_capacity_positive(): void
    {
        $this->assertRejected(fn () => DB::table('rooms')->insert($this->row(['number' => '101', 'room_type_id' => $this->typeId, 'capacity' => 2])));
        $this->assertRejected(fn () => DB::table('rooms')->insert($this->row(['number' => '102', 'room_type_id' => $this->typeId, 'capacity' => 0])));
        $this->assertRejected(fn () => DB::table('rooms')->insert($this->row(['number' => '103', 'room_type_id' => $this->typeId, 'capacity' => 2, 'maintenance_status' => 'CASSEE'])));
    }

    public function test_public_uuid_is_mandatory_and_unique(): void
    {
        $uuid = (string) Str::uuid7();
        DB::table('customers')->insert($this->row(['uuid' => $uuid, 'name' => 'Client A']));

        $this->assertRejected(fn () => DB::table('customers')->insert($this->row(['uuid' => $uuid, 'name' => 'Client B'])));
        $this->assertRejected(fn () => DB::table('customers')->insert($this->row(['uuid' => null, 'name' => 'Client C'])));
    }

    public function test_rate_versions_are_constrained(): void
    {
        $rate = fn (array $overrides) => DB::table('room_rates')->insert($this->row(array_merge([
            'room_type_id' => $this->typeId, 'billing_unit' => 'DAY', 'amount_fcfa' => 50000,
            'effective_from' => '2026-12-01 00:00:00', 'effective_to' => null,
        ], $overrides)));

        $this->assertRejected(fn () => $rate(['effective_to' => '2026-11-01 00:00:00']));
        $this->assertRejected(fn () => $rate(['billing_unit' => 'HOUR']));
        $rate([]);
        // Deux versions d'un même tarif ne peuvent pas commencer au même instant.
        $this->assertRejected(fn () => $rate(['amount_fcfa' => 60000]));
    }

    public function test_payments_are_constrained(): void
    {
        $reservationId = $this->insertReservation();
        $payment = fn (array $overrides) => DB::table('payments')->insert($this->row(array_merge([
            'reservation_id' => $reservationId, 'receipt_number' => 'REC-2026-000001', 'amount_fcfa' => 20000,
            'method' => 'CASH', 'received_at' => now(), 'cashier_id' => $this->userId,
        ], $overrides)));

        $this->assertRejected(fn () => $payment(['amount_fcfa' => 0]));
        $this->assertRejected(fn () => $payment(['status' => 'SUPPRIME']));
        $payment([]);
        $this->assertRejected(fn () => $payment(['receipt_number' => 'REC-2026-000001']));
    }

    public function test_referenced_rows_cannot_be_deleted(): void
    {
        $this->insertReservation();

        $this->assertRejected(fn () => DB::table('rooms')->where('id', $this->roomId)->delete());
        $this->assertRejected(fn () => DB::table('customers')->where('id', $this->customerId)->delete());
        $this->assertRejected(fn () => DB::table('users')->where('id', $this->userId)->delete());
    }
}
