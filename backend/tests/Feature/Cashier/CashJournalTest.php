<?php

namespace Tests\Feature\Cashier;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class CashJournalTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    private string $stay;

    private string $cashPayment;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
        // Chambre 101 VIP, deux journées : 100 000 FCFA.
        $this->stay = $this->bookOk(['end_date' => '2026-12-03', 'quantity' => 2]);
        $this->cashPayment = $this->pay($this->stay, 20000, 'CASH');
        $this->pay($this->stay, 30000, 'MOBILE_MONEY', 'MM-778');
        $cancelled = $this->pay($this->stay, 10000, 'CASH');
        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$cancelled}/cancel", ['reason' => 'Saisie en double'])->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$this->cashPayment}/refunds", ['amount_fcfa' => 5000, 'reason' => 'Geste commercial'])->assertCreated();
    }

    /** Encaissé, remboursé et net : mêmes définitions que le tableau de bord (D-040, D-041). */
    public function test_journal_totals_breakdowns_and_movements(): void
    {
        $response = $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal')->assertOk();
        $data = $response->json('data');

        $this->assertSame(['2026-12-01', '2026-12-01'], [$data['from'], $data['to']]);
        $this->assertSame([
            'collected_fcfa' => 50000, 'refunded_fcfa' => 5000, 'cancelled_fcfa' => 10000,
            'payments_count' => 2, 'refunds_count' => 1, 'net_fcfa' => 45000,
        ], $data['totals']);
        $dashboard = $this->actingAs($this->cashier)->getJson('/api/v1/dashboard')->json('data.collected_today_fcfa');
        $this->assertSame($dashboard, $data['totals']['net_fcfa']);

        $methods = $response->collect('data.by_method')->keyBy('method');
        $this->assertSame(
            ['method' => 'CASH', 'label' => 'Espèces', 'collected_fcfa' => 20000, 'refunded_fcfa' => 5000, 'net_fcfa' => 15000],
            $methods->get('CASH'),
        );
        $this->assertSame(30000, data_get($methods, 'MOBILE_MONEY.net_fcfa'));
        $agents = $response->collect('data.by_agent')->keyBy('label');
        $this->assertSame(50000, data_get($agents, 'Grâce.collected_fcfa'));
        $this->assertSame(-5000, data_get($agents, 'Directeur.net_fcfa'));

        $this->assertCount(4, $data['movements']);
        $this->assertSame(['PAYMENT', 'PAYMENT', 'PAYMENT', 'REFUND'], array_column($data['movements'], 'type'));
        $cancelled = $data['movements'][2];
        $this->assertFalse($cancelled['counted']);
        $this->assertSame(0, $cancelled['signed_amount_fcfa']);
        $this->assertSame('Saisie en double', $cancelled['reason']);
        $refund = $data['movements'][3];
        $this->assertSame(-5000, $refund['signed_amount_fcfa']);
        $this->assertSame($this->cashPayment, $refund['payment_id']);
        $this->assertSame('Espèces', $refund['method_label']);
        $this->assertSame(15000, $data['movements'][0]['refundable_fcfa']);
        $this->assertSame('NGAÏKOSSET Awa', $data['movements'][0]['customer']['full_name']);
        $this->assertSame('101', $data['movements'][0]['room']['number']);
        $this->assertSame($this->stay, $data['movements'][0]['reservation']['id']);
        $this->assertStringNotContainsString('"reservation_id"', (string) json_encode($data));
    }

    public function test_journal_period_and_agent_filters(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-12-02 09:00', 'Africa/Bangui'));
        $this->pay($this->stay, 15000, 'CARD');

        $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal?from=2026-12-02')
            ->assertOk()->assertJsonPath('data.totals.net_fcfa', 15000)->assertJsonCount(1, 'data.movements');
        $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal?from=2026-12-01&to=2026-12-02')
            ->assertOk()->assertJsonPath('data.totals.net_fcfa', 60000);
        $this->actingAs($this->cashier)->getJson("/api/v1/cash-journal?from=2026-12-01&to=2026-12-02&agent_id={$this->admin->uuid}")
            ->assertOk()->assertJsonPath('data.totals.collected_fcfa', 0)->assertJsonPath('data.totals.refunded_fcfa', 5000);

        $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal?from=2026-01-01&to=2026-12-01')
            ->assertStatus(422)->assertJsonValidationErrors(['to']);
        $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal?from=2026-12-02&to=2026-12-01')
            ->assertStatus(422)->assertJsonValidationErrors(['to']);
        $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal?agent_id=42')
            ->assertStatus(422)->assertJsonValidationErrors(['agent_id']);
    }

    public function test_payments_list_filters_and_context(): void
    {
        $page = $this->actingAs($this->cashier)->getJson('/api/v1/payments')->assertOk();
        $page->assertJsonPath('meta.total', 3)->assertJsonPath('meta.last_page', 1);
        $this->assertSame([10000, 30000, 20000], array_column((array) $page->json('data'), 'amount_fcfa'));
        $this->assertSame('101', $page->json('data.0.room.number'));
        $this->assertSame($this->stay, $page->json('data.0.reservation.id'));

        $this->actingAs($this->cashier)->getJson('/api/v1/payments?method=CASH&status=VALID')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.refunded_fcfa', 5000);
        $this->actingAs($this->cashier)->getJson('/api/v1/payments?search=MM-778')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.method', 'MOBILE_MONEY');
        $receipt = $page->json('data.2.receipt_number');
        $this->actingAs($this->cashier)->getJson('/api/v1/payments?search='.urlencode((string) $receipt))
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $this->cashPayment);
        $this->actingAs($this->cashier)->getJson('/api/v1/payments?from=2026-12-02')->assertOk()->assertJsonPath('meta.total', 0);
        $this->actingAs($this->cashier)->getJson('/api/v1/payments?method=BITCOIN')->assertStatus(422)->assertJsonValidationErrors(['method']);
    }

    public function test_receipt_carries_hotel_header_and_current_situation(): void
    {
        $receipt = $this->actingAs($this->cashier)->getJson("/api/v1/payments/{$this->cashPayment}")->assertOk();

        $receipt->assertJsonPath('data.hotel.name', 'JB Hôtel');
        $receipt->assertJsonPath('data.summary.balance_fcfa', 100000 - 45000);
        $this->assertSame('2026-12-01T10:00:00+01:00', $receipt->json('data.summary_at'));
    }

    public function test_journal_and_lists_require_the_payments_permission(): void
    {
        Role::findByName('caissiere', 'web')->revokePermissionTo('payments.view');

        $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal')->assertStatus(403);
        $this->actingAs($this->cashier)->getJson('/api/v1/payments')->assertStatus(403);
        $this->actingAs($this->cashier)->getJson('/api/v1/receivables')->assertStatus(403);
    }

    private function pay(string $reservation, int $amount, string $method, ?string $reference = null): string
    {
        return (string) $this->actingAs($this->cashier)
            ->postJson("/api/v1/reservations/{$reservation}/payments", ['amount_fcfa' => $amount, 'method' => $method, 'reference' => $reference])
            ->assertCreated()->json('data.id');
    }
}
