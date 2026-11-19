<?php

namespace Tests\Feature\Reporting;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class ReceivablesTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** Avance de 20 000 sur 50 000 : il reste 30 000 (critère d'acceptation du document 06). */
    public function test_lists_positive_balances_of_active_reservations(): void
    {
        $partial = $this->bookOk(); // 101 VIP, 50 000
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$partial}/payments", ['amount_fcfa' => 20000, 'method' => 'CASH'])->assertCreated();
        $paid = $this->bookOk(['room_id' => $this->room102->uuid]); // 30 000, réglé
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$paid}/payments", ['amount_fcfa' => 30000, 'method' => 'CASH'])->assertCreated();
        $later = $this->bookOk(['room_id' => $this->room102->uuid, 'start_date' => '2026-12-05', 'end_date' => '2026-12-05']); // 30 000
        $cancelled = $this->bookOk(['start_date' => '2026-12-09', 'end_date' => '2026-12-09']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$cancelled}/cancel", ['reason' => 'Client absent'])->assertOk();

        $response = $this->actingAs($this->cashier)->getJson('/api/v1/receivables')->assertOk();

        $this->assertSame([$partial, $later], array_column((array) $response->json('data'), 'id'));
        $response->assertJsonPath('data.0.paid_net_fcfa', 20000);
        $response->assertJsonPath('data.0.balance_fcfa', 30000);
        $response->assertJsonPath('data.0.customer', 'NGAÏKOSSET Awa');
        $response->assertJsonPath('total_fcfa', 60000);
        $this->assertSame(60000, $this->actingAs($this->cashier)->getJson('/api/v1/dashboard')->json('data.receivables_fcfa'));
    }
}
