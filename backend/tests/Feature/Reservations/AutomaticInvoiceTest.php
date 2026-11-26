<?php

namespace Tests\Feature\Reservations;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Cashier\Models\Payment;
use App\Modules\Reservations\Contracts\StayInvoicing;
use App\Shared\Idempotency\IdempotencyRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class AutomaticInvoiceTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    public function test_creation_creates_one_invoice_without_a_second_request_and_replays_its_reference(): void
    {
        $key = (string) Str::uuid();
        $create = fn () => $this->actingAs($this->cashier)->withHeader('Idempotency-Key', $key)
            ->postJson('/api/v1/reservations', $this->payload());
        $first = $create()->assertCreated()->assertJsonPath('meta.automatic_invoice.number', 'FAC-2026-000001');
        $create()->assertCreated()->assertHeader('Idempotent-Replayed', 'true')
            ->assertJsonPath('meta.automatic_invoice.id', $first->json('meta.automatic_invoice.id'));
        $this->assertSame(1, Invoice::query()->count());
        $this->assertSame(50000, Invoice::query()->firstOrFail()->net_fcfa);
    }

    public function test_pending_reservation_is_invoiced_only_when_confirmed(): void
    {
        $reservation = $this->bookOk(['confirm' => false]);
        $this->assertSame(0, Invoice::query()->count());
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations/'.$reservation.'/confirm')
            ->assertOk()->assertJsonPath('meta.automatic_invoice.number', 'FAC-2026-000001');
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations/'.$reservation.'/confirm')->assertStatus(409);
        $this->assertSame(1, Invoice::query()->count());
    }

    public function test_invoice_failure_rolls_back_the_whole_booking(): void
    {
        $this->mock(StayInvoicing::class, function ($mock): void {
            $mock->shouldReceive('issueOnConfirmation')->once()->andThrow(new RuntimeException('Simulated invoice failure'));
        });
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations', $this->payload())->assertStatus(500);
        $this->assertDatabaseCount('reservations', 0);
        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_automatic_invoice_does_not_require_delegating_manual_invoice_permission(): void
    {
        $this->cashier->syncRoles([]);
        $this->cashier->givePermissionTo('reservations.create');
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations', $this->payload())
            ->assertCreated()->assertJsonPath('meta.automatic_invoice.number', 'FAC-2026-000001');
    }

    public function test_late_payment_replay_after_pruning_is_still_recorded_once(): void
    {
        $reservation = $this->bookOk();
        $key = (string) Str::uuid();
        $pay = fn () => $this->actingAs($this->cashier)->withHeader('Idempotency-Key', $key)
            ->postJson('/api/v1/reservations/'.$reservation.'/payments', ['amount_fcfa' => 1000, 'method' => 'CASH']);
        $first = $pay()->assertCreated();
        $this->travel(45)->days();
        $this->artisan('model:prune', ['--model' => [IdempotencyRecord::class]])->assertSuccessful();
        $pay()->assertCreated()->assertHeader('Idempotent-Replayed', 'true')->assertJsonPath('data.id', $first->json('data.id'));
        $this->assertSame(1, Payment::query()->count());
    }

    public function test_observed_price_mismatch_is_refused_instead_of_charging_another_amount(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations', $this->payload(['expected_unit_price_fcfa' => 1000]))
            ->assertStatus(409)->assertJsonPath('code', 'offline_rate_review');
        $this->assertDatabaseCount('reservations', 0);
        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_a_booking_made_during_a_week_long_outage_can_be_received_after_its_stay_dates(): void
    {
        $recordedAt = now()->toIso8601String();
        $this->travel(7)->days();
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations', $this->payload())
            ->assertUnprocessable()->assertJsonValidationErrors('start_date');
        $header = rtrim(strtr(base64_encode((string) json_encode([
            'kind' => 'reservation.create', 'label' => 'Reprise après coupure', 'created_at' => $recordedAt,
        ])), '+/', '-_'), '=');
        $this->actingAs($this->cashier)->withHeaders([
            'X-Offline-Replay' => $header, 'Idempotency-Key' => (string) Str::uuid(),
        ])->postJson('/api/v1/reservations', $this->payload(['expected_unit_price_fcfa' => 50000]))
            ->assertCreated()->assertJsonPath('meta.automatic_invoice.number', 'FAC-2026-000001');
        $this->assertDatabaseCount('reservations', 1);
    }
}
