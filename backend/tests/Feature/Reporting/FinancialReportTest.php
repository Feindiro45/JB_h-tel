<?php

namespace Tests\Feature\Reporting;

use App\Modules\Identity\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

final class FinancialReportTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    public function test_totals_reconcile_with_cash_journal_and_credit_notes(): void
    {
        $id = $this->bookOk(['discount' => ['type' => 'PERCENT', 'value' => 10, 'reason' => 'Fidélité']]);
        $payment = $this->postJson("/api/v1/reservations/$id/payments", ['amount_fcfa' => 20000, 'method' => 'CASH'])->assertCreated()->json('data.id');
        $invoice = $this->postJson("/api/v1/reservations/$id/invoices")->assertCreated()->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/payments/$payment/refunds", ['amount_fcfa' => 5000, 'reason' => 'Correction'])->assertCreated();
        $this->postJson("/api/v1/invoices/$invoice/credit-notes", ['reason' => 'Correction'])->assertCreated();
        $this->postJson("/api/v1/reservations/$id/invoices")->assertCreated();
        $this->postJson("/api/v1/reservations/$id/payments", ['amount_fcfa' => 1000, 'method' => 'CASH'])->assertCreated();
        $cancelled = $this->getJson("/api/v1/reservations/$id/payments")->json('data.1.id');
        $this->postJson("/api/v1/payments/$cancelled/cancel", ['reason' => 'Doublon'])->assertOk();
        $data = $this->getJson('/api/v1/reports/financial?from=2026-12-01&to=2026-12-01')->assertOk()
            ->assertJsonPath('data.totals.collected_fcfa', 20000)->assertJsonPath('data.totals.refunded_fcfa', 5000)
            ->assertJsonPath('data.totals.net_collected_fcfa', 15000)->assertJsonPath('data.totals.net_invoiced_fcfa', 45000)
            ->assertJsonPath('data.totals.discount_fcfa', 5000)->assertJsonPath('data.totals.stays_count', 1)
            ->assertJsonPath('data.totals.receivables_fcfa', 30000)
            ->assertJsonPath('data.occupancy.reserved', 1)->assertJsonPath('data.occupancy.free', 1)
            ->assertJsonPath('data.reconciliation.difference_fcfa', 0)->json('data');
        $journal = $this->getJson('/api/v1/cash-journal?from=2026-12-01&to=2026-12-01')->assertOk()->json('data.totals');
        $this->assertSame($journal['net_fcfa'], $data['totals']['net_collected_fcfa']);
        $this->assertSame(15000, $data['reconciliation']['type_net_fcfa']);
        $this->assertSame(15000, $data['daily'][0]['net_fcfa']);
    }

    public function test_dates_room_type_and_agent_filter_each_operation_by_its_author(): void
    {
        $id = $this->bookOk();
        $payment = $this->postJson("/api/v1/reservations/$id/payments", ['amount_fcfa' => 20000, 'method' => 'CASH'])->assertCreated()->json('data.id');
        $this->travelTo(now()->addDay());
        $this->actingAs($this->admin)->postJson("/api/v1/payments/$payment/refunds", ['amount_fcfa' => 5000, 'reason' => 'Correction'])->assertCreated();
        $base = '/api/v1/reports/financial?from=2026-12-02&to=2026-12-02';
        $this->getJson($base)->assertOk()->assertJsonPath('data.totals.net_collected_fcfa', -5000);
        $this->getJson($base.'&room_type_id='.$this->standard->uuid)->assertOk()->assertJsonPath('data.totals.net_collected_fcfa', 0);
        $this->getJson($base.'&room_id='.$this->room101->uuid.'&agent_id='.$this->admin->uuid)->assertOk()->assertJsonPath('data.totals.net_collected_fcfa', -5000);
        $this->getJson($base.'&agent_id='.$this->cashier->uuid)->assertOk()->assertJsonPath('data.totals.net_collected_fcfa', 0);
    }

    public function test_exports_and_period_validation_and_permissions(): void
    {
        $url = '/api/v1/reports/financial?from=2026-12-01&to=2026-12-01';
        $this->actingAs($this->admin)->get($url.'&format=csv')->assertOk()->assertDownload('rapport-2026-12-01-2026-12-01.csv');
        $this->assertStringContainsString('Encaissé FCFA', $this->get($url.'&format=csv')->streamedContent());
        $pdf = $this->get($url.'&format=pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $pdf->getContent());
        $this->getJson('/api/v1/reports/financial?from=2026-12-01&to=2026-11-01')->assertUnprocessable();
        $this->getJson('/api/v1/reports/financial?from=2026-01-01&to=2027-12-01')->assertUnprocessable();
        $this->actingAs($this->cashier)->getJson($url)->assertOk();
        $this->getJson($url.'&format=csv')->assertForbidden();
        $this->actingAs(User::factory()->create())->getJson($url)->assertForbidden();
    }
}
