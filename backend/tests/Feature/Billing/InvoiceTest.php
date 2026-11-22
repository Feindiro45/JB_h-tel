<?php

namespace Tests\Feature\Billing;

use App\Modules\Billing\Application\InvoiceTicketRenderer;
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
    /**
     * D-053 (demande du 19/11/2026) : la prolongation d'un séjour facturé annule la facture par un
     * avoir et émet, dans la même opération, une facture qui détaille séjour initial et prolongation.
     */
    public function test_extension_replaces_the_invoice_with_initial_stay_and_extension_lines(): void
    {
        $reservation = $this->bookOk();
        $first = $this->issue($reservation)->json('data.id');

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/extension", ['end_date' => '2026-12-02', 'additional_quantity' => 1, 'confirm' => true])
            ->assertOk()
            ->assertJsonPath('data.price.net_fcfa', 100000)
            ->assertJsonPath('meta.replacement_invoice_number', 'FAC-2026-000002');

        $this->actingAs($this->cashier)->getJson("/api/v1/invoices/{$first}")
            ->assertJsonPath('data.status', 'CREDITED')
            ->assertJsonPath('data.net_fcfa', 50000);
        $documents = $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$reservation}/invoices")->assertOk()->collect('data');
        $this->assertEqualsCanonicalizing(['FAC-2026-000001', 'AV-2026-000001', 'FAC-2026-000002'], $documents->pluck('number')->all());

        $creditNote = $documents->firstWhere('type', 'CREDIT_NOTE');
        $this->actingAs($this->cashier)->getJson("/api/v1/invoices/{$creditNote['id']}")
            ->assertJsonPath('data.net_fcfa', 50000)
            ->assertJsonPath('data.credited_invoice.number', 'FAC-2026-000001')
            ->assertJsonPath('data.snapshot.credit.reason', 'Prolongation du séjour : la nouvelle facture détaille le séjour initial et la prolongation.');

        $replacement = $documents->firstWhere('number', 'FAC-2026-000002');
        $this->actingAs($this->cashier)->getJson("/api/v1/invoices/{$replacement['id']}")
            ->assertJsonPath('data.status', 'ISSUED')
            ->assertJsonPath('data.net_fcfa', 100000)
            ->assertJsonPath('data.snapshot.replaces.invoice_number', 'FAC-2026-000001')
            ->assertJsonCount(2, 'data.snapshot.lines')
            ->assertJsonPath('data.snapshot.lines.0.kind', 'STAY')
            ->assertJsonPath('data.snapshot.lines.0.label', 'Hébergement — chambre 101 (VIP), journée — séjour initial du 01/12/2026 au 01/12/2026')
            ->assertJsonPath('data.snapshot.lines.0.quantity', 1)
            ->assertJsonPath('data.snapshot.lines.0.amount_fcfa', 50000)
            ->assertJsonPath('data.snapshot.lines.1.kind', 'EXTENSION')
            ->assertJsonPath('data.snapshot.lines.1.label', 'Prolongation du 01/12/2026 au 02/12/2026 — chambre 101 (VIP), journée')
            ->assertJsonPath('data.snapshot.lines.1.quantity', 1)
            ->assertJsonPath('data.snapshot.lines.1.amount_fcfa', 50000)
            ->assertJsonPath('data.snapshot.totals.gross_fcfa', 100000);
        $this->assertStringStartsWith('%PDF', $this->app->make(InvoiceTicketRenderer::class)->bytes(Invoice::query()->where('uuid', $replacement['id'])->firstOrFail()));

        // Facturé du mois : 50 000 + 100 000 − 50 000 (avoir) = 100 000, sans double compte.
        $this->assertSame(100000, $this->actingAs($this->admin)->getJson('/api/v1/dashboard')->json('data.invoiced_month_fcfa'));
        $this->actingAs($this->admin)->postJson("/api/v1/invoices/{$first}/credit-notes", ['reason' => 'Encore'])
            ->assertStatus(409)->assertJsonPath('code', 'invoice_not_creditable');
    }

    /** Séjour prolongé avant toute facture : rien n'est émis ; la facture suivante est détaillée. */
    public function test_extension_without_invoice_issues_nothing_and_next_invoice_is_detailed(): void
    {
        $reservation = $this->bookOk(['discount' => ['type' => 'PERCENT', 'value' => 10, 'reason' => 'Client fidèle']]);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/extension", ['end_date' => '2026-12-02', 'additional_quantity' => 1, 'confirm' => true])
            ->assertOk()->assertJsonPath('meta.replacement_invoice_number', null);
        $this->assertSame(0, Invoice::query()->count());

        $this->issue($reservation)->assertCreated()
            ->assertJsonPath('data.number', 'FAC-2026-000001')
            ->assertJsonCount(2, 'data.snapshot.lines')
            ->assertJsonPath('data.snapshot.lines.0.amount_fcfa', 50000)
            ->assertJsonPath('data.snapshot.lines.1.amount_fcfa', 50000)
            ->assertJsonPath('data.snapshot.totals.gross_fcfa', 100000)
            ->assertJsonPath('data.snapshot.totals.discount_fcfa', 10000)
            ->assertJsonPath('data.net_fcfa', 90000);
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

    /** D-065 : le ticket 80 mm (une seule bande, QR code) remplace la facture A4, qui n'existe plus. */
    public function test_ticket_pdf_is_a_single_80_mm_strip_built_from_the_snapshot(): void
    {
        $reservation = $this->bookOk(['discount' => ['type' => 'FIXED', 'value' => 2500, 'reason' => 'Arrondi']]);
        $id = $this->issue($reservation)
            ->assertJsonPath('data.verification_qr', fn (string $qr) => str_starts_with($qr, 'data:image/png;base64,'))
            ->json('data.id');

        $pdf = $this->app->make(InvoiceTicketRenderer::class)->bytes(Invoice::query()->where('uuid', $id)->firstOrFail());

        $this->assertStringStartsWith('%PDF', $pdf);
        $this->assertSame(1, preg_match_all('#/Type /Page\b#', $pdf), 'Une seule page : la bande continue du ticket.');
        $this->assertSame(1, preg_match('#/MediaBox \[0\.000 0\.000 226\.77\d (\d+)\.\d+\]#', $pdf, $box));
        $this->assertGreaterThan(300, (int) $box[1]);
        $this->assertLessThan(1400, (int) $box[1]);
        $this->actingAs($this->cashier)->get("/api/v1/invoices/{$id}/pdf")->assertNotFound();
        // La liste reste légère : pas de QR code par ligne.
        $this->actingAs($this->cashier)->getJson('/api/v1/invoices')->assertJsonMissingPath('data.0.verification_qr');
    }
}
