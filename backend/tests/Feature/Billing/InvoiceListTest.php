<?php

namespace Tests\Feature\Billing;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class InvoiceListTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** Facturé = factures − avoirs ; client et chambre lus dans l'instantané figé. */
    public function test_lists_invoices_and_credit_notes_with_totals(): void
    {
        $first = $this->bookOk(); // 101 VIP, 50 000
        $second = $this->bookOk(['room_id' => $this->room102->uuid]); // 102 Standard, 30 000
        $invoice = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$first}/invoices")->assertCreated()->json('data');
        $this->travelTo(CarbonImmutable::parse('2026-12-02 11:00', 'Africa/Bangui'));
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$second}/invoices")->assertCreated();
        $credit = $this->actingAs($this->admin)->postJson("/api/v1/invoices/{$invoice['id']}/credit-notes", ['reason' => 'Erreur de nom'])->assertCreated()->json('data');

        $list = $this->actingAs($this->cashier)->getJson('/api/v1/invoices')->assertOk();

        $list->assertJsonPath('meta.total', 3);
        $list->assertJsonPath('totals', ['invoices_fcfa' => 80000, 'credit_notes_fcfa' => 50000, 'net_invoiced_fcfa' => 30000, 'count' => 3]);
        $rows = collect((array) $list->json('data'))->keyBy('number');
        $this->assertSame('CREDITED', data_get($rows, "{$invoice['number']}.status"));
        $this->assertSame($invoice['number'], data_get($rows, "{$credit['number']}.credited_invoice.number"));
        $this->assertSame('NGAÏKOSSET Awa', data_get($rows, "{$invoice['number']}.customer.full_name"));
        $this->assertSame('101', data_get($rows, "{$invoice['number']}.room.number"));
        $this->assertSame($first, data_get($rows, "{$credit['number']}.reservation.id"));
        $this->assertArrayNotHasKey('snapshot', (array) $list->json('data.0'));
        $this->assertStringNotContainsString('verification_code', (string) $list->getContent());

        $this->actingAs($this->cashier)->getJson('/api/v1/invoices?type=CREDIT_NOTE')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('totals.net_invoiced_fcfa', -50000);
        $this->actingAs($this->cashier)->getJson('/api/v1/invoices?status=ISSUED&type=INVOICE')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.net_fcfa', 30000);
        $this->actingAs($this->cashier)->getJson('/api/v1/invoices?from=2026-12-01&to=2026-12-01')
            ->assertOk()->assertJsonPath('meta.total', 1);
        $this->actingAs($this->cashier)->getJson('/api/v1/invoices?search='.urlencode((string) $credit['number']))
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.type', 'CREDIT_NOTE');
        $this->actingAs($this->cashier)->getJson('/api/v1/invoices?type=RECU')->assertStatus(422)->assertJsonValidationErrors(['type']);
    }
}
