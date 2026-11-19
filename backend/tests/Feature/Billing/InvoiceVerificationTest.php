<?php

namespace Tests\Feature\Billing;

use App\Modules\Billing\Models\Invoice;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/** D-036 : QR code sur la facture et vérification par tout public, sans connexion. */
class InvoiceVerificationTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    private Invoice $invoice;

    private string $url;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
        $reservation = $this->bookOk();
        $response = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/invoices")->assertCreated();
        $this->invoice = Invoice::query()->where('uuid', $response->json('data.id'))->firstOrFail();
        $this->url = (string) $response->json('data.verification_url');
        $this->app['auth']->forgetGuards();
    }

    private function path(?string $code = null, ?string $uuid = null): string
    {
        return '/verification/factures/'.($uuid ?? $this->invoice->uuid).'?code='.($code ?? $this->invoice->verification_code);
    }

    public function test_invoice_exposes_a_verification_url_with_uuid_and_code(): void
    {
        $this->assertSame('http://localhost:8000'.$this->path(), $this->url);
        $this->assertSame(24, strlen($this->invoice->verification_code));
        $this->assertArrayNotHasKey('verification_code', $this->invoice->toArray());
    }

    public function test_anyone_can_verify_a_genuine_invoice_without_logging_in(): void
    {
        $this->assertGuest();

        $this->get($this->path())
            ->assertOk()
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow')
            ->assertSee('Document authentique')
            ->assertSee('FAC-2026-000001')
            ->assertSee('50 000 FCFA')
            ->assertSee('N. A.')
            ->assertDontSee('NGAÏKOSSET')
            ->assertDontSee('+236 72 00 00 00');
    }

    public function test_wrong_code_and_unknown_invoice_get_the_same_not_found_answer(): void
    {
        $wrongCode = $this->get($this->path('code-faux'))->assertNotFound()->assertSee('Document introuvable');
        $unknown = $this->get($this->path(null, (string) Str::uuid7()))->assertNotFound()->assertSee('Document introuvable');
        $this->get('/verification/factures/'.$this->invoice->uuid)->assertNotFound();
        $this->get('/verification/factures/123?code=x')->assertNotFound();

        $this->assertSame($wrongCode->getContent(), $unknown->getContent());
        $this->assertStringNotContainsString('FAC-2026-000001', (string) $wrongCode->getContent());
    }

    public function test_cancelled_invoice_is_reported_as_cancelled_by_its_credit_note(): void
    {
        $credit = $this->actingAs($this->admin)
            ->postJson("/api/v1/invoices/{$this->invoice->uuid}/credit-notes", ['reason' => 'Erreur de chambre'])
            ->assertCreated();
        $this->app['auth']->forgetGuards();

        $this->get($this->path())
            ->assertOk()
            ->assertSee('cette facture a été annulée')
            ->assertSee('AV-2026-000001');

        $this->get((string) parse_url((string) $credit->json('data.verification_url'), PHP_URL_PATH).'?'.parse_url((string) $credit->json('data.verification_url'), PHP_URL_QUERY))
            ->assertOk()
            ->assertSee('Avoir n° AV-2026-000001')
            ->assertSee('FAC-2026-000001');
    }

    public function test_json_verification_api_is_public_and_minimal(): void
    {
        $this->getJson("/api/v1/public/invoices/{$this->invoice->uuid}/verification?code={$this->invoice->verification_code}")
            ->assertOk()
            ->assertJsonPath('data.authentic', true)
            ->assertJsonPath('data.number', 'FAC-2026-000001')
            ->assertJsonPath('data.net_fcfa', 50000)
            ->assertJsonPath('data.status', 'ISSUED')
            ->assertJsonPath('data.customer_initials', 'N. A.')
            ->assertJsonMissingPath('data.snapshot')
            ->assertJsonMissingPath('data.customer');

        $this->getJson("/api/v1/public/invoices/{$this->invoice->uuid}/verification?code=faux")
            ->assertNotFound()
            ->assertJsonPath('code', 'document_not_found');
    }

    public function test_pdf_embeds_the_qr_code_and_the_code_is_never_audited(): void
    {
        $pdf = (string) $this->actingAs($this->cashier)->get("/api/v1/invoices/{$this->invoice->uuid}/pdf")->assertOk()->getContent();

        $this->assertStringContainsString('/Subtype /Image', $pdf);
        $this->assertStringNotContainsString($this->invoice->verification_code, (string) json_encode(AuditLog::query()->get()->toArray()));
    }

    public function test_public_verification_is_rate_limited(): void
    {
        for ($i = 0; $i < 30; $i++) {
            $this->get($this->path('essai-'.$i));
        }

        $this->get($this->path())->assertStatus(429);
    }
}
