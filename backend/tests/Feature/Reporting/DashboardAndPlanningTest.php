<?php

namespace Tests\Feature\Reporting;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class DashboardAndPlanningTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** Facturé, encaissé net et soldes à recevoir restent des indicateurs distincts. */
    public function test_dashboard_separates_invoiced_collected_and_receivables(): void
    {
        $today = $this->bookOk(['start_time' => '15:00', 'end_time' => '23:00', 'billing_unit' => 'HALF_DAY']); // 30 000
        $stay = $this->bookOk(['room_id' => $this->room102->uuid, 'start_date' => '2026-12-01', 'end_date' => '2026-12-03', 'quantity' => 2]); // 60 000
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$stay}/check-in")->assertOk();
        $payment = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$stay}/payments", ['amount_fcfa' => 20000, 'method' => 'CASH'])->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$payment}/refunds", ['amount_fcfa' => 5000, 'reason' => 'Geste'])->assertCreated();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$stay}/invoices")->assertCreated();
        $cancelled = $this->bookOk(['start_date' => '2026-12-09', 'end_date' => '2026-12-09']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$cancelled}/cancel", ['reason' => 'x'])->assertOk();

        $data = $this->actingAs($this->cashier)->getJson('/api/v1/dashboard')->assertOk()->json('data');

        $this->assertSame('2026-12-01', $data['date']);
        $this->assertSame(15000, $data['collected_today_fcfa']);
        $this->assertSame(90000, $data['invoiced_month_fcfa']); // Deux séjours facturés automatiquement ; l'annulation est compensée par son avoir.
        $this->assertSame(30000 + 45000, $data['receivables_fcfa']);
        $this->assertCount(7, $data['collected_last_7_days']);
        $this->assertSame(['date' => '2026-12-01', 'net_fcfa' => 15000], end($data['collected_last_7_days']));
        $this->assertSame([$today], array_column($data['arrivals_today'], 'id'));
        $this->assertSame('15:00', $data['arrivals_today'][0]['start_time']);
        $this->assertSame([], $data['departures_today']);
        $this->assertSame('NGAÏKOSSET Awa', $data['recent_reservations'][0]['customer']);
        $this->assertStringNotContainsString('"customer_id"', (string) json_encode($data));
    }

    public function test_dashboard_requires_the_reports_permission(): void
    {
        Role::findByName('caissiere', 'web')->revokePermissionTo('reports.view');

        $this->actingAs($this->cashier)->getJson('/api/v1/dashboard')->assertStatus(403);
    }

    public function test_planning_gives_each_room_state_day_by_day(): void
    {
        $this->bookOk(['start_date' => '2026-12-02', 'end_date' => '2026-12-03', 'quantity' => 1]);
        $this->room102->forceFill(['maintenance_status' => 'MAINTENANCE'])->save();

        $response = $this->actingAs($this->cashier)->getJson('/api/v1/planning?from=2026-12-01&days=4')->assertOk();

        $this->assertSame(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'], $response->json('days'));
        $rows = collect((array) $response->json('data'))->keyBy('room.number');
        $this->assertSame(['2026-12-01' => 'FREE', '2026-12-02' => 'RESERVED', '2026-12-03' => 'RESERVED', '2026-12-04' => 'FREE'], data_get($rows, '101.days'));
        $this->assertSame('MAINTENANCE', data_get($rows, '102.days.2026-12-01'));
        $this->assertSame('Réservée', $response->json('labels.RESERVED'));

        $this->actingAs($this->cashier)->getJson('/api/v1/planning?days=40')->assertStatus(422)->assertJsonValidationErrors(['days']);
        $this->actingAs($this->cashier)->getJson("/api/v1/planning?room_type_id={$this->vip->uuid}")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonCount(7, 'days');
    }
}
