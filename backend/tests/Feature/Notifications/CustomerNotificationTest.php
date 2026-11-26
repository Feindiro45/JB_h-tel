<?php

namespace Tests\Feature\Notifications;

use App\Modules\Billing\Contracts\InvoiceDocument;
use App\Modules\Billing\Contracts\InvoiceDocuments;
use App\Modules\Billing\Infrastructure\EloquentInvoiceDocuments;
use App\Modules\Notifications\Mail\StayMail;
use App\Shared\Audit\AuditLog;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use LogicException;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/** D-039 : le client qui a donné son e-mail est prévenu à chaque opération sur son séjour. */
class CustomerNotificationTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
        $this->customer->forceFill(['email' => 'awa@exemple.cf'])->save();
        Mail::fake();
    }

    /** @return list<string> */
    private function sentKinds(): array
    {
        return Mail::sent(StayMail::class)->map(fn (StayMail $mail) => $mail->message->kind)->values()->all();
    }

    public function test_confirmation_and_welcome_message_is_sent_in_french(): void
    {
        $this->bookOk(['start_time' => '14:00', 'end_time' => '20:00', 'billing_unit' => 'HALF_DAY']);

        Mail::assertSent(StayMail::class, fn (StayMail $mail) => $mail->hasTo('awa@exemple.cf')
            && $mail->message->kind === 'reservation.confirmed');

        /** @var StayMail $mail */
        $mail = Mail::sent(StayMail::class)->first(fn (StayMail $message) => $message->message->kind === 'reservation.confirmed');
        $this->assertSame('Votre réservation est confirmée — JB Hôtel', $mail->envelope()->subject);
        $html = $mail->render();
        foreach (['Bienvenue chez JB Hôtel', 'Bonjour NGAÏKOSSET Awa', '101 (VIP)', '01/12/2026 à 14:00', '30 000 FCFA', 'Reste à régler', 'se désinscrire'] as $expected) {
            $this->assertStringContainsString($expected, $html);
        }
    }

    public function test_every_stay_operation_notifies_the_customer(): void
    {
        $id = $this->bookOk();
        $paymentId = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/payments", ['amount_fcfa' => 50000, 'method' => 'CASH'])->json('data.id');
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-in")->assertOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/extension", ['end_date' => '2026-12-02', 'additional_quantity' => 1, 'confirm' => true])->assertOk();
        $invoiceId = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/invoices")->assertCreated()->json('data.id');
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/check-out", ['unpaid_reason' => 'Paiement prévu plus tard'])->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/invoices/{$invoiceId}/credit-notes", ['reason' => 'Correction'])->assertCreated();
        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$paymentId}/refunds", ['amount_fcfa' => 5000, 'reason' => 'Geste commercial'])->assertCreated();
        $other = $this->bookOk(['start_date' => '2026-12-10', 'end_date' => '2026-12-10']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$other}/cancel", ['reason' => 'Empêchement'])->assertOk();

        $this->assertEqualsCanonicalizing([
            'reservation.confirmed', 'invoice.issued', 'payment.recorded', 'reservation.checked_in',
            'invoice.credit_note', 'invoice.issued', 'reservation.extended',
            'reservation.checked_out', 'invoice.credit_note', 'payment.refunded',
            'reservation.confirmed', 'invoice.issued', 'invoice.credit_note', 'reservation.cancelled',
        ], $this->sentKinds());
        $this->assertSame(14, AuditLog::query()->where('action', 'notification.sent')->count());
    }

    public function test_invoice_email_attaches_the_ticket_with_its_verification_link(): void
    {
        $id = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/invoices")->assertCreated();

        Mail::assertSent(StayMail::class, function (StayMail $mail): bool {
            if ($mail->message->kind !== 'invoice.issued') {
                return false;
            }
            $attachment = $mail->attachments()[0];
            $this->assertSame('ticket-FAC-2026-000001.pdf', $attachment->as);
            $this->assertSame('application/pdf', $attachment->mime);
            $this->assertStringStartsWith('%PDF', $attachment->attachWith(fn (string $path) => $path, fn (Closure $data) => $data()));
            $this->assertStringContainsString('/verification/factures/', (string) $mail->message->actionUrl);

            return true;
        });
    }

    public function test_receipt_email_shows_amount_and_balance(): void
    {
        $id = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/payments", ['amount_fcfa' => 20000, 'method' => 'MOBILE_MONEY'])->assertCreated();

        /** @var StayMail $mail */
        $mail = Mail::sent(StayMail::class)->first(fn (StayMail $m) => $m->message->kind === 'payment.recorded');
        $this->assertSame('Reçu de paiement REC-2026-000001 — JB Hôtel', $mail->envelope()->subject);
        $this->assertSame('20 000 FCFA', $mail->message->details['Montant reçu']);
        $this->assertSame('30 000 FCFA', $mail->message->details['Reste à régler']);
        $this->assertSame('Mobile money', $mail->message->details['Moyen de paiement']);
    }

    public function test_no_email_is_sent_without_address_or_after_opt_out(): void
    {
        $this->customer->forceFill(['email' => null])->save();
        $this->bookOk();
        Mail::assertNothingSent();

        $this->customer->forceFill(['email' => 'awa@exemple.cf', 'email_notifications' => false])->save();
        $this->bookOk(['start_date' => '2026-12-03', 'end_date' => '2026-12-03']);
        Mail::assertNothingSent();
    }

    public function test_failed_operation_sends_nothing(): void
    {
        $this->bookOk();
        Mail::fake();

        $this->book()->assertStatus(409);
        Mail::assertNothingSent();
    }

    public function test_signed_unsubscribe_link_stops_notifications(): void
    {
        $url = URL::signedRoute('public.customers.unsubscribe', ['customer' => $this->customer->uuid]);

        $this->get($url.'x')->assertForbidden();
        $this->get($url)->assertOk()->assertSee('Désinscription enregistrée');

        $this->assertFalse($this->customer->refresh()->email_notifications);
        $this->assertSame(1, AuditLog::query()->where('action', 'customer.unsubscribed')->count());

        $this->bookOk();
        Mail::assertNothingSent();
    }

    public function test_customer_record_exposes_and_updates_the_preference(): void
    {
        $this->actingAs($this->cashier)->getJson("/api/v1/customers/{$this->customer->uuid}")
            ->assertJsonPath('data.email_notifications', true);

        $this->actingAs($this->cashier)->patchJson("/api/v1/customers/{$this->customer->uuid}", ['email_notifications' => false])
            ->assertOk()
            ->assertJsonPath('data.email_notifications', false);
    }

    /** Le PDF (rendu dompdf de plusieurs secondes) n'est produit que si un e-mail part réellement. */
    public function test_invoice_pdf_is_not_rendered_when_the_customer_cannot_be_emailed(): void
    {
        $this->customer->forceFill(['email' => null])->save();
        $documents = $this->app->make(EloquentInvoiceDocuments::class);
        $this->app->bind(InvoiceDocuments::class, fn () => new class($documents) implements InvoiceDocuments
        {
            public function __construct(private readonly EloquentInvoiceDocuments $documents) {}

            public function find(int $invoiceId): ?InvoiceDocument
            {
                $document = $this->documents->find($invoiceId);

                return $document === null ? null : new InvoiceDocument(
                    $document->reservationId, $document->isCreditNote, $document->typeLabel, $document->number,
                    $document->netFcfa, $document->creditedNumber, $document->verificationUrl,
                    fn (): string => throw new LogicException('Le PDF ne doit pas être rendu sans destinataire.'),
                );
            }
        });
        $reservation = $this->bookOk();

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/invoices")->assertCreated();
        Mail::assertNothingSent();
    }
}
