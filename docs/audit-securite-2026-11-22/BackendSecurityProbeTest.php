<?php

// Local audit reproductions: run only against the dedicated jb_hotel_test database.
namespace Tests\SecurityAudit;

use App\Modules\Identity\Models\User;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Models\RoomRate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class BackendSecurityProbeTest extends TestCase
{
    use BuildsHotel;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        if (config('database.connections.mysql.database') !== 'jb_hotel_test') {
            throw new \RuntimeException('Security probes require jb_hotel_test.');
        }
        $this->buildHotel();
    }

    public function test_client_supplied_offline_date_cannot_select_an_old_cheaper_rate(): void
    {
        $old = RoomRate::query()->where('room_type_id', $this->vip->id)
            ->where('billing_unit', BillingUnit::Day->value)->firstOrFail();
        $old->forceFill(['effective_to' => now()->subDay()])->save();
        RoomRate::factory()->create([
            'room_type_id' => $this->vip->id,
            'billing_unit' => BillingUnit::Day,
            'amount_fcfa' => 100000,
            'effective_from' => now()->subDay(),
        ]);
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations/quote', $this->payload())
            ->assertOk()->assertJsonPath('data.price.unit_price_fcfa', 100000);
        $header = rtrim(strtr(base64_encode(json_encode([
            'kind' => 'reservation.create',
            'label' => 'Synthetic offline replay',
            'created_at' => now()->subDays(2)->toIso8601String(),
        ], JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
        $this->actingAs($this->cashier)->withHeader('X-Offline-Replay', $header)
            ->postJson('/api/v1/reservations', $this->payload())
            ->assertStatus(409)->assertJsonPath('code', 'offline_rate_review');
    }

    public function test_delegating_user_management_does_not_allow_self_promotion_to_admin(): void
    {
        $this->actingAs($this->admin)->putJson('/api/v1/roles/caissiere/permissions', [
            'permissions' => ['users.manage'],
        ])->assertOk();
        $cashier = User::query()->findOrFail($this->cashier->id);
        $this->actingAs($cashier)->patchJson('/api/v1/users/'.$cashier->uuid, ['role' => 'admin'])
            ->assertStatus(403)->assertJsonPath('code', 'admin_role_required');
        $this->assertFalse($cashier->fresh()->hasPermissionTo('records.delete'));
    }

    public function test_replaying_a_payment_after_idempotency_pruning_is_still_recorded_once(): void
    {
        $reservation = $this->bookOk();
        $key = (string) \Illuminate\Support\Str::uuid();
        $pay = fn () => $this->flushHeaders()->actingAs($this->cashier)
            ->withHeader('Idempotency-Key', $key)
            ->postJson('/api/v1/reservations/'.$reservation.'/payments', [
                'amount_fcfa' => 1000,
                'method' => 'CASH',
            ]);

        $first = $pay()->assertCreated();
        $this->travel(31)->days();
        $this->artisan('model:prune', [
            '--model' => [\App\Shared\Idempotency\IdempotencyRecord::class],
        ])->assertSuccessful();
        $second = $pay()->assertCreated()->assertHeader('Idempotent-Replayed', 'true');

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, \App\Modules\Cashier\Models\Payment::query()->count());
    }
}
