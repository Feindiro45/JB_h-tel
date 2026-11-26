<?php

namespace Tests\Feature\Reservations;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Cashier\Models\Refund;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\InvoiceReference;
use App\Modules\Reservations\Contracts\StayInvoicing;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Models\ReservationExtension;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LogicException;
use RuntimeException;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * D-053 (constat et choix de l'utilisateur du 19/11/2026) : une réservation annulée, payée ou non,
 * ne doit plus peser sur la caisse ni sur le facturé. L'encaissé est remboursé et la facture
 * annulée par un avoir, dans la même transaction que l'annulation.
 */
class CancellationSettlementTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    private function pay(string $reservation, int $amount): void
    {
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/payments", ['amount_fcfa' => $amount, 'method' => 'CASH'])->assertCreated();
    }

    public function test_cashier_cannot_cancel_a_paid_reservation_and_nothing_changes(): void
    {
        $reservation = $this->bookOk();
        $this->pay($reservation, 20000);

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/cancel", ['reason' => 'Client empêché', 'refund_fcfa' => 20000])
            ->assertStatus(403)
            ->assertJsonPath('code', 'cancellation_requires_refund')
            ->assertJsonPath('title', 'Remboursement nécessaire');

        $this->assertSame('CONFIRMED', Reservation::query()->where('uuid', $reservation)->firstOrFail()->status->value);
        $this->assertSame(0, Refund::query()->count());
    }

    public function test_admin_cancels_and_refunds_every_receipt_so_the_cash_desk_no_longer_counts_the_stay(): void
    {
        $reservation = $this->bookOk();
        $this->pay($reservation, 20000);
        $this->pay($reservation, 10000);

        $this->actingAs($this->admin)->postJson("/api/v1/reservations/{$reservation}/cancel", ['reason' => 'Client empêché', 'refund_fcfa' => 30000, 'refund_method' => 'MOBILE_MONEY'])
            ->assertOk()
            ->assertJsonPath('data.status', 'CANCELLED')
            ->assertJsonPath('data.price.net_fcfa', 50000)
            ->assertJsonPath('data.price.amount_due_fcfa', 0);

        $this->assertSame([20000, 10000], Refund::query()->orderBy('id')->pluck('amount_fcfa')->all());
        $this->assertSame(['MOBILE_MONEY'], Refund::query()->distinct()->pluck('method')->all());
        $this->assertSame(['Annulation de la réservation : Client empêché'], Refund::query()->distinct()->pluck('reason')->all());

        $this->actingAs($this->admin)->getJson("/api/v1/reservations/{$reservation}/payments")
            ->assertJsonPath('summary.amount_due_fcfa', 0)
            ->assertJsonPath('summary.net_paid_fcfa', 0)
            ->assertJsonPath('summary.balance_fcfa', 0);
        $this->actingAs($this->admin)->getJson('/api/v1/cash-journal?from=2026-12-01&to=2026-12-01')
            ->assertJsonPath('data.totals.collected_fcfa', 30000)
            ->assertJsonPath('data.totals.refunded_fcfa', 30000)
            ->assertJsonPath('data.totals.net_fcfa', 0);
        $this->actingAs($this->admin)->getJson('/api/v1/dashboard')
            ->assertJsonPath('data.collected_today_fcfa', 0)
            ->assertJsonPath('data.receivables_fcfa', 0)
            ->assertJsonPath('data.recent_reservations.0.amount_due_fcfa', 0);
        $this->actingAs($this->admin)->getJson('/api/v1/receivables')
            ->assertJsonPath('to_refund', [])
            ->assertJsonPath('to_refund_total_fcfa', 0);

        $this->assertSame(1, AuditLog::query()->where('action', 'reservation.cancelled')->count());
        $this->assertSame(2, AuditLog::query()->where('action', 'payment.refunded')->count());
    }

    public function test_refund_amount_must_be_confirmed_and_match_what_was_collected(): void
    {
        $reservation = $this->bookOk();
        $this->pay($reservation, 20000);

        foreach ([['reason' => 'Client empêché'], ['reason' => 'Client empêché', 'refund_fcfa' => 15000]] as $body) {
            $this->actingAs($this->admin)->postJson("/api/v1/reservations/{$reservation}/cancel", $body)
                ->assertStatus(409)
                ->assertJsonPath('code', 'cancellation_refund_mismatch')
                ->assertJsonPath('errors', null);
        }
        $this->assertSame('CONFIRMED', Reservation::query()->where('uuid', $reservation)->firstOrFail()->status->value);
        $this->assertSame(0, Refund::query()->count());

        $this->actingAs($this->admin)->postJson("/api/v1/reservations/{$reservation}/cancel", ['reason' => 'x', 'refund_fcfa' => 20000, 'refund_method' => 'CHEQUE'])
            ->assertStatus(422)->assertJsonValidationErrors(['refund_method']);
    }

    /** Non payée mais facturée (demande du 19/11/2026, « pareil pour une réservation non payée »). */
    public function test_cancelling_an_unpaid_invoiced_reservation_credits_the_invoice(): void
    {
        $reservation = $this->bookOk();
        $invoice = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/invoices")->assertCreated()->json('data.id');
        $this->assertSame(50000, $this->actingAs($this->admin)->getJson('/api/v1/dashboard')->json('data.invoiced_month_fcfa'));

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/cancel", ['reason' => 'Doublon'])
            ->assertOk()->assertJsonPath('data.price.amount_due_fcfa', 0);

        $this->actingAs($this->cashier)->getJson("/api/v1/invoices/{$invoice}")->assertJsonPath('data.status', 'CREDITED');
        $creditNote = Invoice::query()->where('type', 'CREDIT_NOTE')->firstOrFail();
        $this->assertSame('Annulation de la réservation : Doublon', $creditNote->snapshot_json['credit']['reason']);
        $this->assertSame(50000, $creditNote->net_fcfa);
        $dashboard = $this->actingAs($this->admin)->getJson('/api/v1/dashboard');
        $dashboard->assertJsonPath('data.invoiced_month_fcfa', 0)
            ->assertJsonPath('data.receivables_fcfa', 0)
            ->assertJsonPath('data.collected_today_fcfa', 0);
        $this->assertSame(0, Refund::query()->count());
    }

    public function test_unpaid_uninvoiced_cancellation_still_works_for_the_cashier(): void
    {
        $reservation = $this->bookLegacyUninvoiced();

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/cancel", ['reason' => 'Client absent'])
            ->assertOk()->assertJsonPath('data.status', 'CANCELLED')->assertJsonPath('data.price.amount_due_fcfa', 0);
        $this->assertSame(0, Invoice::query()->count());
        $this->assertSame(0, Refund::query()->count());
    }

    /** Tout ou rien : si l'avoir échoue, ni l'annulation ni les remboursements ne sont conservés. */
    public function test_cancellation_refunds_and_credit_note_share_one_transaction(): void
    {
        $reservation = $this->bookOk();
        $this->pay($reservation, 20000);
        $this->app->bind(StayInvoicing::class, fn () => new FailingStayInvoicing(onCancel: true));

        $this->actingAs($this->admin)->postJson("/api/v1/reservations/{$reservation}/cancel", ['reason' => 'x', 'refund_fcfa' => 20000])->assertStatus(500);

        $this->assertSame('CONFIRMED', Reservation::query()->where('uuid', $reservation)->firstOrFail()->status->value);
        $this->assertSame(0, Refund::query()->count());
        $this->assertSame(0, AuditLog::query()->where('action', 'reservation.cancelled')->count());
    }

    /** Tout ou rien : si la facture de remplacement échoue, la prolongation n'est pas conservée. */
    public function test_extension_and_invoice_replacement_share_one_transaction(): void
    {
        $reservation = $this->bookOk();
        $this->app->bind(StayInvoicing::class, fn () => new FailingStayInvoicing(onCancel: false));

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/extension", ['end_date' => '2026-12-02', 'additional_quantity' => 1, 'confirm' => true])->assertStatus(500);

        $stay = Reservation::query()->where('uuid', $reservation)->firstOrFail();
        $this->assertSame('2026-12-01', $stay->end_date->toDateString());
        $this->assertSame(50000, $stay->net_fcfa);
        $this->assertSame(0, ReservationExtension::query()->count());
    }

    public function test_extension_is_recorded_and_cannot_be_changed(): void
    {
        $reservation = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/extension", ['end_date' => '2026-12-02', 'end_time' => '12:00', 'additional_quantity' => 1, 'confirm' => true])->assertOk();

        $extension = ReservationExtension::query()->sole();
        $this->assertSame('2026-12-01', $extension->previous_end_date->toDateString());
        $this->assertSame('2026-12-02', $extension->end_date->toDateString());
        $this->assertSame(1, $extension->added_quantity);
        $this->assertSame(50000, $extension->amount_fcfa);
        $this->assertSame(50000, $extension->previous_net_fcfa);
        $this->assertSame(100000, $extension->net_fcfa);
        $this->assertSame($this->cashier->id, $extension->extended_by);

        $this->expectException(LogicException::class);
        $extension->update(['amount_fcfa' => 1]);
    }
}

/** Facturation en panne, pour prouver que l'opération sur le séjour est annulée avec elle. */
final class FailingStayInvoicing implements StayInvoicing
{
    public function __construct(private readonly bool $onCancel) {}

    public function issueOnConfirmation(int $reservationId, User $actor): void {}

    public function activeInvoiceReference(int $reservationId): ?InvoiceReference
    {
        return null;
    }

    public function creditOnCancellation(int $reservationId, string $reason, User $actor): ?string
    {
        return $this->onCancel ? throw new RuntimeException('Panne simulée de la facturation') : null;
    }

    public function replaceAfterExtension(int $reservationId, User $actor): ?string
    {
        return $this->onCancel ? null : throw new RuntimeException('Panne simulée de la facturation');
    }

    public function replaceAfterChange(int $reservationId, string $reason, User $actor): ?string
    {
        return null;
    }

    public function hasActiveInvoice(int $reservationId): bool
    {
        return false;
    }

    public function hasDocuments(int $reservationId): bool
    {
        return false;
    }
}
