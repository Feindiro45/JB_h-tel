<?php

namespace Tests\Feature\Billing;

use App\Modules\Billing\Models\Invoice;
use App\Modules\RoomCatalog\Application\Services\RateService;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\DTO\PublishRateData;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use LogicException;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class InvoiceTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** @return TestResponse<Response> */
    private function issue(string $reservation): TestResponse
    {
        return $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/invoices");
    }

    public function test_invoice_is_numbered_and_freezes_amounts_payments_and_balance(): void
    {
        $reservation = $this->bookOk(['discount' => ['type' => 'PERCENT', 'value' => 10, 'reason' => 'Client fidèle']]);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/payments", ['amount_fcfa' => 20000, 'method' => 'CASH'])->assertCreated();

        $this->issue($reservation)
            ->assertCreated()
            ->assertJsonPath('data.number', 'FAC-2026-000001')
            ->assertJsonPath('data.type_label', 'Facture')
            ->assertJsonPath('data.status', 'ISSUED')
            ->assertJsonPath('data.gross_fcfa', 50000)
            ->assertJsonPath('data.discount_fcfa', 5000)
            ->assertJsonPath('data.net_fcfa', 45000)
            ->assertJsonPath('data.snapshot.customer.full_name', 'NGAÏKOSSET Awa')
            ->assertJsonPath('data.snapshot.room.number', '101')
            ->assertJsonPath('data.snapshot.totals.discount_label', '10 %')
            ->assertJsonPath('data.snapshot.totals.discount_reason', 'Client fidèle')
            ->assertJsonPath('data.snapshot.payments.lines.0.receipt_number', 'REC-2026-000001')
            ->assertJsonPath('data.snapshot.payments.balance_fcfa', 25000)
            ->assertJsonPath('data.snapshot.hotel.name', 'JB Hôtel')
            ->assertJsonPath('data.snapshot.issued_by.name', 'Grâce');

        $this->assertSame(1, AuditLog::query()->where('action', 'invoice.issued')->count());
    }

    /** Critère d'acceptation : 50 000 → 60 000 ; l'ancienne facture reste à 50 000, la nouvelle réservation utilise 60 000. */
    public function test_rate_change_never_alters_an_issued_invoice(): void
    {
        $old = $this->bookOk();
        $oldInvoice = $this->issue($old)->assertCreated()->json('data.id');

        app(RateService::class)->publish(new PublishRateData($this->vip->id, BillingUnit::Day, 60000, 'Révision'));
        $new = $this->bookOk(['start_date' => '2026-12-03', 'end_date' => '2026-12-03']);
        $this->issue($new)->assertCreated()->assertJsonPath('data.net_fcfa', 60000)->assertJsonPath('data.number', 'FAC-2026-000002');

        $this->actingAs($this->cashier)->getJson("/api/v1/invoices/{$oldInvoice}")
            ->assertOk()
            ->assertJsonPath('data.net_fcfa', 50000)
            ->assertJsonPath('data.snapshot.lines.0.unit_price_fcfa', 50000);
    }

    public function test_issued_invoice_is_immutable_and_unaffected_by_later_payments(): void
    {
        $reservation = $this->bookOk();
        $id = $this->issue($reservation)->json('data.id');
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/payments", ['amount_fcfa' => 50000, 'method' => 'CASH'])->assertCreated();

        $this->actingAs($this->cashier)->getJson("/api/v1/invoices/{$id}")
            ->assertJsonPath('data.snapshot.payments.lines', [])
            ->assertJsonPath('data.snapshot.payments.balance_fcfa', 50000);

        $invoice = Invoice::query()->where('uuid', $id)->firstOrFail();
        try {
            $invoice->update(['net_fcfa' => 1]);
            $this->fail('La modification aurait dû être refusée.');
        } catch (LogicException) {
        }
        $this->expectException(LogicException::class);
        $invoice->delete();
    }

    public function test_only_one_active_invoice_and_not_for_pending_or_cancelled_reservations(): void
    {
        $reservation = $this->bookOk();
        $this->issue($reservation)->assertCreated();
        $this->issue($reservation)->assertStatus(409)->assertJsonPath('code', 'invoice_already_issued');

        $pending = $this->bookOk(['start_date' => '2026-12-05', 'end_date' => '2026-12-05', 'confirm' => false]);
        $this->issue($pending)->assertStatus(409)->assertJsonPath('code', 'reservation_not_billable');

        $cancelled = $this->bookOk(['start_date' => '2026-12-07', 'end_date' => '2026-12-07']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$cancelled}/cancel", ['reason' => 'Annulé']);
        $this->issue($cancelled)->assertStatus(409)->assertJsonPath('code', 'reservation_not_billable');
    }

    /** Correction par avoir : la facture d'origine reste intacte, puis une nouvelle facture reflète la prolongation. */
    public function test_credit_note_then_new_invoice_after_extension(): void
    {
        $reservation = $this->bookOk();
        $first = $this->issue($reservation)->json('data.id');

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/extension", ['end_date' => '2026-12-02', 'additional_quantity' => 1, 'confirm' => true])
            ->assertOk()->assertJsonPath('data.price.net_fcfa', 100000);

        $this->actingAs($this->admin)->postJson("/api/v1/invoices/{$first}/credit-notes", ['reason' => 'Prolongation d’une journée'])
            ->assertCreated()
            ->assertJsonPath('data.type', 'CREDIT_NOTE')
            ->assertJsonPath('data.number', 'AV-2026-000001')
            ->assertJsonPath('data.net_fcfa', 50000)
            ->assertJsonPath('data.credited_invoice.number', 'FAC-2026-000001')
            ->assertJsonPath('data.snapshot.credit.reason', 'Prolongation d’une journée');

        $this->actingAs($this->cashier)->getJson("/api/v1/invoices/{$first}")
            ->assertJsonPath('data.status', 'CREDITED')
            ->assertJsonPath('data.net_fcfa', 50000);

        $this->issue($reservation)->assertCreated()->assertJsonPath('data.number', 'FAC-2026-000002')->assertJsonPath('data.net_fcfa', 100000);
        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$reservation}/invoices")
            ->assertOk()->assertJsonCount(3, 'data');

        $this->actingAs($this->admin)->postJson("/api/v1/invoices/{$first}/credit-notes", ['reason' => 'Encore'])
            ->assertStatus(409)->assertJsonPath('code', 'invoice_not_creditable');
    }

    /** Provisoire (D-020) : la caissière émet les factures, seul l'administrateur émet un avoir. */
    public function test_permissions_and_uuid_routes(): void
    {
        $reservation = $this->bookOk();
        $id = $this->issue($reservation)->json('data.id');

        $this->actingAs($this->cashier)->postJson("/api/v1/invoices/{$id}/credit-notes", ['reason' => 'x'])->assertStatus(403);
        $this->actingAs($this->admin)->postJson("/api/v1/invoices/{$id}/credit-notes", [])->assertStatus(422)->assertJsonValidationErrors(['reason']);

        $invoice = Invoice::query()->where('uuid', $id)->firstOrFail();
        $this->actingAs($this->cashier)->getJson("/api/v1/invoices/{$invoice->id}")->assertNotFound();
    }

    public function test_pdf_is_generated_server_side_from_the_snapshot(): void
    {
        $reservation = $this->bookOk(['discount' => ['type' => 'FIXED', 'value' => 2500, 'reason' => 'Arrondi']]);
        $id = $this->issue($reservation)->json('data.id');

        $response = $this->actingAs($this->cashier)->get("/api/v1/invoices/{$id}/pdf")->assertOk();

        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringStartsWith('%PDF', (string) $response->getContent());
        $this->assertStringContainsString('FAC-2026-000001.pdf', (string) $response->headers->get('Content-Disposition'));
    }
}
