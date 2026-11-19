<?php

namespace Tests\Feature\RoomCatalog;

use App\Modules\Identity\Models\User;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Contracts\CurrentPriceProvider;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use App\Shared\Audit\AuditLog;
use App\Shared\Exceptions\BusinessRuleException;
use Database\Seeders\RolesAndPermissionsSeeder;
use Database\Seeders\RoomTypesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class RoomRateTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private RoomType $vip;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolesAndPermissionsSeeder::class, RoomTypesSeeder::class]);
        $this->admin = User::factory()->admin()->create(['name' => 'Directeur']);
        $this->vip = RoomType::query()->where('code', 'VIP')->firstOrFail();
        $this->travelTo(now()->setTime(10, 0));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return TestResponse<Response>
     */
    private function publish(array $overrides = []): TestResponse
    {
        return $this->actingAs($this->admin)->postJson('/api/v1/room-rates', array_merge([
            'room_type_id' => $this->vip->uuid,
            'billing_unit' => 'DAY',
            'amount_fcfa' => 50000,
            'reason' => 'Tarif initial',
        ], $overrides));
    }

    private function vipDayRate(int $amount, string $from, ?string $to = null): RoomRate
    {
        return RoomRate::factory()->create([
            'room_type_id' => $this->vip->id, 'billing_unit' => BillingUnit::Day,
            'amount_fcfa' => $amount, 'effective_from' => $from, 'effective_to' => $to,
        ]);
    }

    private function currentVipDay(): int
    {
        return app(CurrentPriceProvider::class)->currentRate($this->vip->id, BillingUnit::Day)->amountFcfa;
    }

    public function test_admin_publishes_an_immediate_rate_shown_in_the_grid(): void
    {
        $this->publish()
            ->assertCreated()
            ->assertJsonPath('data.amount_fcfa', 50000)
            ->assertJsonPath('data.status', 'ACTIVE')
            ->assertJsonPath('data.status_label', 'En vigueur')
            ->assertJsonPath('data.created_by.name', 'Directeur')
            ->assertJsonPath('data.room_type.id', $this->vip->uuid);

        $this->actingAs($this->admin)
            ->getJson('/api/v1/room-rates/grid')
            ->assertOk()
            ->assertJsonPath('data.0.room_type.code', 'VIP')
            ->assertJsonPath('data.0.rates.DAY.current.amount_fcfa', 50000)
            ->assertJsonPath('data.0.rates.HALF_DAY.current', null)
            ->assertJsonPath('data.1.room_type.code', 'STANDARD');

        $this->assertSame(50000, $this->currentVipDay());
    }

    /**
     * Recette 5 et critère d'acceptation : passer le tarif VIP de 50 000 à 60 000 FCFA.
     * L'ancienne version et la réservation existante restent à 50 000 ; une nouvelle réservation
     * utilise 60 000.
     */
    public function test_rate_change_from_50000_to_60000_leaves_existing_prices_intact(): void
    {
        $old = $this->vipDayRate(50000, now()->subMonth()->toDateTimeString());
        $reservationId = $this->insertReservationAt($old, 50000);

        $this->publish(['amount_fcfa' => 60000, 'reason' => 'Révision annuelle'])->assertCreated();

        $old->refresh();
        $this->assertSame(50000, $old->amount_fcfa);
        $this->assertTrue($old->effective_to?->equalTo(now()->setMicrosecond(0)));
        $this->assertSame(50000, (int) DB::table('reservations')->where('id', $reservationId)->value('applied_unit_price_fcfa'));
        $this->assertSame($old->id, (int) DB::table('reservations')->where('id', $reservationId)->value('rate_id'));
        $this->assertSame(60000, $this->currentVipDay());

        $history = $this->actingAs($this->admin)
            ->getJson("/api/v1/room-rates?room_type_id={$this->vip->uuid}&billing_unit=DAY")
            ->assertOk()
            ->json('data');
        $this->assertSame([60000, 50000], array_column($history, 'amount_fcfa'));
        $this->assertSame(50000, $history[0]['previous_amount_fcfa']);
        $this->assertSame('Révision annuelle', $history[0]['reason']);
        $this->assertSame('Directeur', $history[0]['created_by']['name']);
        $this->assertSame(['ACTIVE', 'EXPIRED'], array_column($history, 'status'));

        $audit = AuditLog::query()->where('action', 'rate.published')->firstOrFail();
        $this->assertSame(50000, $audit->before_json['amount_fcfa'] ?? null);
        $this->assertSame(60000, $audit->after_json['amount_fcfa'] ?? null);
    }

    public function test_scheduled_rate_applies_only_from_its_effective_date(): void
    {
        $this->vipDayRate(50000, now()->subMonth()->toDateTimeString());

        $this->publish(['amount_fcfa' => 55000, 'effective_from' => now()->addWeek()->toDateTimeString(), 'reason' => 'Haute saison'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'SCHEDULED')
            ->assertJsonPath('data.withdrawable', true);

        $this->assertSame(50000, $this->currentVipDay());
        $this->actingAs($this->admin)->getJson('/api/v1/room-rates/grid')
            ->assertJsonPath('data.0.rates.DAY.current.amount_fcfa', 50000)
            ->assertJsonPath('data.0.rates.DAY.next.amount_fcfa', 55000);

        $this->travel(8)->days();
        $this->assertSame(55000, $this->currentVipDay());
    }

    public function test_versions_stay_contiguous_without_overlap(): void
    {
        $this->vipDayRate(50000, now()->subMonth()->toDateTimeString());
        $this->publish(['amount_fcfa' => 70000, 'effective_from' => now()->addDays(10)->toDateTimeString()])->assertCreated();
        $this->publish(['amount_fcfa' => 60000, 'effective_from' => now()->addDays(5)->toDateTimeString()])->assertCreated();

        $chain = RoomRate::query()->forChain($this->vip->id, BillingUnit::Day)->orderBy('effective_from')->get();
        $this->assertSame([50000, 60000, 70000], $chain->pluck('amount_fcfa')->all());
        for ($i = 0; $i < $chain->count() - 1; $i++) {
            $this->assertTrue($chain[$i]->effective_to?->equalTo($chain[$i + 1]->effective_from), "Trou ou chevauchement après la version {$i}");
        }
        $this->assertNull($chain->last()?->effective_to);
    }

    public function test_past_effective_date_and_duplicate_start_are_refused(): void
    {
        $this->publish(['effective_from' => now()->subDay()->toDateTimeString()])
            ->assertStatus(422)
            ->assertJsonPath('code', 'rate_in_past');

        $start = now()->addDays(3)->setTime(0, 0)->toDateTimeString();
        $this->publish(['effective_from' => $start])->assertCreated();
        $this->publish(['effective_from' => $start, 'amount_fcfa' => 52000])
            ->assertStatus(409)
            ->assertJsonPath('code', 'rate_version_conflict');
    }

    public function test_scheduled_version_can_be_withdrawn_but_not_an_effective_one(): void
    {
        $current = $this->vipDayRate(50000, now()->subMonth()->toDateTimeString());
        $scheduledId = $this->publish(['amount_fcfa' => 65000, 'effective_from' => now()->addWeek()->toDateTimeString()])->json('data.id');

        $this->actingAs($this->admin)->deleteJson("/api/v1/room-rates/{$current->uuid}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'rate_already_effective');

        $this->actingAs($this->admin)->deleteJson("/api/v1/room-rates/{$scheduledId}")->assertNoContent();

        $this->assertNull($current->refresh()->effective_to);
        $this->assertFalse(RoomRate::query()->where('uuid', $scheduledId)->exists());
        $this->assertSame(1, AuditLog::query()->where('action', 'rate.withdrawn')->count());
    }

    /** Critère d'acceptation : la caissière ne peut pas modifier un tarif si son rôle ne le permet pas. */
    public function test_cashier_can_read_rates_but_cannot_change_them(): void
    {
        $cashier = User::factory()->cashier()->create();
        $rate = $this->vipDayRate(50000, now()->addWeek()->toDateTimeString());

        $this->actingAs($cashier)->getJson('/api/v1/room-rates/grid')->assertOk();
        $this->actingAs($cashier)
            ->postJson('/api/v1/room-rates', ['room_type_id' => $this->vip->uuid, 'billing_unit' => 'DAY', 'amount_fcfa' => 1000, 'reason' => 'x'])
            ->assertStatus(403)
            ->assertJsonPath('title', 'Accès refusé');
        $this->actingAs($cashier)->deleteJson("/api/v1/room-rates/{$rate->uuid}")->assertStatus(403);

        $this->assertSame(1, RoomRate::query()->count());
    }

    public function test_rate_payload_is_validated_in_french(): void
    {
        $this->publish(['amount_fcfa' => 50000.5, 'billing_unit' => 'HOUR', 'reason' => ''])
            ->assertStatus(422)
            ->assertJsonPath('errors.amount_fcfa.0', 'Le champ montant doit être un entier.')
            ->assertJsonPath('errors.reason.0', 'Le champ motif est obligatoire.')
            ->assertJsonValidationErrors(['billing_unit']);

        $this->publish(['room_type_id' => (string) Str::uuid7()])->assertJsonValidationErrors(['room_type_id']);
        $this->publish(['room_type_id' => $this->vip->id])->assertJsonValidationErrors(['room_type_id']);
    }

    public function test_price_provider_refuses_a_missing_rate_and_honours_the_reference_time(): void
    {
        $this->vipDayRate(50000, now()->subMonth()->toDateTimeString(), now()->subDay()->toDateTimeString());
        $this->vipDayRate(60000, now()->subDay()->toDateTimeString());
        $provider = app(CurrentPriceProvider::class);

        $this->assertSame(50000, $provider->currentRate($this->vip->id, BillingUnit::Day, now()->subWeek())->amountFcfa);
        $this->assertSame(60000, $provider->currentRate($this->vip->id, BillingUnit::Day)->amountFcfa);

        try {
            $provider->currentRate($this->vip->id, BillingUnit::HalfDay);
            $this->fail('Une exception rate_not_defined était attendue.');
        } catch (BusinessRuleException $e) {
            $this->assertSame('rate_not_defined', $e->errorCode());
            $this->assertSame(409, $e->status());
            $this->assertStringContainsString('Demi-journée', $e->getMessage());
        }
    }

    private function insertReservationAt(RoomRate $rate, int $price): int
    {
        $room = Room::factory()->create(['room_type_id' => $this->vip->id]);
        $customerId = DB::table('customers')->insertGetId(['uuid' => (string) Str::uuid7(), 'name' => 'Client', 'created_at' => now(), 'updated_at' => now()]);

        return DB::table('reservations')->insertGetId([
            'uuid' => (string) Str::uuid7(), 'customer_id' => $customerId, 'room_id' => $room->id, 'rate_id' => $rate->id,
            'start_date' => now()->toDateString(), 'end_date' => now()->toDateString(),
            'blocked_from' => now()->startOfDay(), 'blocked_until' => now()->addDay()->startOfDay(),
            'billing_unit' => 'DAY', 'quantity' => 1, 'applied_unit_price_fcfa' => $price, 'gross_fcfa' => $price,
            'discount_fcfa' => 0, 'net_fcfa' => $price, 'status' => 'CONFIRMED', 'created_by' => $this->admin->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
