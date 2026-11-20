<?php

namespace Tests\Feature\Cashier;

use App\Modules\Cashier\Models\Payment;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Models\Reservation;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Spatie\Permission\Models\Role;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class CashierTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    private string $reservation;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
        $this->reservation = $this->bookOk(); // 101 VIP, une journée : 50 000 FCFA
    }

    /** @return TestResponse<Response> */
    private function pay(int $amount, string $method = 'CASH', ?string $reservation = null): TestResponse
    {
        return $this->actingAs($this->cashier)->postJson('/api/v1/reservations/'.($reservation ?? $this->reservation).'/payments', [
            'amount_fcfa' => $amount, 'method' => $method,
        ]);
    }

    /** Critère d'acceptation et recette 7 : avance de 20 000 sur 50 000 → solde 30 000 ; un reçu par versement. */
    public function test_advance_leaves_a_balance_and_each_payment_has_a_receipt(): void
    {
        $this->pay(20000)
            ->assertCreated()
            ->assertJsonPath('data.receipt_number', 'REC-2026-000001')
            ->assertJsonPath('data.method_label', 'Espèces')
            ->assertJsonPath('data.cashier.name', 'Grâce')
            ->assertJsonPath('summary.amount_due_fcfa', 50000)
            ->assertJsonPath('summary.net_paid_fcfa', 20000)
            ->assertJsonPath('summary.balance_fcfa', 30000)
            ->assertJsonPath('summary.status_label', 'Partiellement payé');

        $this->pay(30000, 'MOBILE_MONEY')
            ->assertCreated()
            ->assertJsonPath('data.receipt_number', 'REC-2026-000002')
            ->assertJsonPath('summary.balance_fcfa', 0)
            ->assertJsonPath('summary.status_label', 'Soldé');

        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$this->reservation}/payments")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('summary.status', 'PAID');
        $this->assertSame(2, AuditLog::query()->where('action', 'payment.recorded')->count());
    }

    public function test_deferred_payment_and_overpayment_refused(): void
    {
        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$this->reservation}/payments")
            ->assertOk()
            ->assertJsonPath('summary.status_label', 'Non payé')
            ->assertJsonPath('summary.balance_fcfa', 50000);

        $this->pay(40000)->assertCreated();
        $this->pay(15000)
            ->assertStatus(422)
            ->assertJsonPath('code', 'overpayment')
            ->assertJsonPath('details.2', 'Solde restant : 10 000 FCFA.');
        $this->assertSame(1, Payment::query()->count());
    }

    public function test_payment_payload_is_validated(): void
    {
        $this->pay(0)->assertStatus(422)->assertJsonValidationErrors(['amount_fcfa']);
        $this->pay(1000, 'CHEQUE')->assertStatus(422)->assertJsonValidationErrors(['method']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$this->reservation}/payments", ['amount_fcfa' => 1500.5, 'method' => 'CASH'])
            ->assertStatus(422)->assertJsonPath('errors.amount_fcfa.0', 'Le champ montant doit être un entier.');
        $this->pay(1000, 'CASH', (string) Str::uuid7())->assertNotFound();
    }

    /** Recette 9 : le remboursement corrige l'encaissement net sans effacer le paiement initial. */
    public function test_refund_reduces_net_collection_but_keeps_the_payment(): void
    {
        $paymentId = $this->pay(50000)->json('data.id');

        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$paymentId}/refunds", ['amount_fcfa' => 10000, 'reason' => 'Geste commercial', 'method' => 'CASH'])
            ->assertCreated()
            ->assertJsonPath('data.amount_fcfa', 10000)
            ->assertJsonPath('data.processed_by.name', 'Directeur');

        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$this->reservation}/payments")
            ->assertJsonPath('data.0.amount_fcfa', 50000)
            ->assertJsonPath('data.0.refunded_fcfa', 10000)
            ->assertJsonPath('data.0.status', 'VALID')
            ->assertJsonPath('summary.paid_fcfa', 50000)
            ->assertJsonPath('summary.refunded_fcfa', 10000)
            ->assertJsonPath('summary.net_paid_fcfa', 40000)
            ->assertJsonPath('summary.balance_fcfa', 10000);

        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$paymentId}/refunds", ['amount_fcfa' => 40001, 'reason' => 'Trop'])
            ->assertStatus(422)->assertJsonPath('code', 'refund_exceeds_payment');
        $this->assertSame(1, Payment::query()->count());
    }

    public function test_cancelling_a_payment_is_traced_and_never_deletes_it(): void
    {
        $paymentId = $this->pay(20000)->json('data.id');

        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$paymentId}/cancel", ['reason' => 'Saisie en double'])
            ->assertOk()
            ->assertJsonPath('data.status', 'CANCELLED')
            ->assertJsonPath('data.status_label', 'Annulé')
            ->assertJsonPath('data.cancellation_reason', 'Saisie en double');

        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$this->reservation}/payments")
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('summary.net_paid_fcfa', 0)
            ->assertJsonPath('summary.balance_fcfa', 50000);

        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$paymentId}/cancel", ['reason' => 'Encore'])
            ->assertStatus(409)->assertJsonPath('code', 'payment_already_cancelled');
        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$paymentId}/refunds", ['amount_fcfa' => 100, 'reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'payment_cancelled');
        $this->assertSame(1, AuditLog::query()->where('action', 'payment.cancelled')->count());
    }

    public function test_payment_with_refund_cannot_be_cancelled(): void
    {
        $paymentId = $this->pay(20000)->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$paymentId}/refunds", ['amount_fcfa' => 5000, 'reason' => 'Partiel'])->assertCreated();

        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$paymentId}/cancel", ['reason' => 'Erreur'])
            ->assertStatus(409)->assertJsonPath('code', 'payment_has_refunds');
    }

    /** D-053 : l'annulation rembourse ce qui a été encaissé ; le séjour annulé ne peut plus être payé. */
    public function test_cancelled_reservation_is_refunded_and_cannot_be_paid(): void
    {
        $this->pay(20000)->assertCreated();
        $this->actingAs($this->admin)->postJson("/api/v1/reservations/{$this->reservation}/cancel", ['reason' => 'Client empêché', 'refund_fcfa' => 20000])->assertOk();

        $this->pay(1000)->assertStatus(409)->assertJsonPath('code', 'reservation_cancelled');
        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$this->reservation}/payments")
            ->assertJsonPath('summary.amount_due_fcfa', 0)
            ->assertJsonPath('summary.net_paid_fcfa', 0)
            ->assertJsonPath('summary.balance_fcfa', 0);
    }

    /** Annulation antérieure à D-053 (ou forcée en base) : l'encaissé reste « trop-perçu à rembourser ». */
    public function test_legacy_cancelled_overpayment_still_shows_amount_to_refund(): void
    {
        $this->pay(20000)->assertCreated();
        Reservation::query()->where('uuid', $this->reservation)->update(['status' => 'CANCELLED', 'cancelled_at' => now()]);

        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$this->reservation}/payments")
            ->assertJsonPath('summary.amount_due_fcfa', 0)
            ->assertJsonPath('summary.balance_fcfa', -20000)
            ->assertJsonPath('summary.status_label', 'Trop-perçu à rembourser');
        $this->actingAs($this->cashier)->getJson('/api/v1/receivables')
            ->assertJsonPath('data', [])
            ->assertJsonPath('to_refund.0.id', $this->reservation)
            ->assertJsonPath('to_refund.0.to_refund_fcfa', 20000)
            ->assertJsonPath('to_refund_total_fcfa', 20000);
    }

    public function test_receipt_shows_reservation_customer_room_and_balance(): void
    {
        $paymentId = $this->pay(20000)->json('data.id');

        $this->actingAs($this->cashier)->getJson("/api/v1/payments/{$paymentId}")
            ->assertOk()
            ->assertJsonPath('data.receipt_number', 'REC-2026-000001')
            ->assertJsonPath('data.reservation.id', $this->reservation)
            ->assertJsonPath('data.customer.full_name', 'NGAÏKOSSET Awa')
            ->assertJsonPath('data.room.number', '101')
            ->assertJsonPath('data.summary.balance_fcfa', 30000);

        $payment = Payment::query()->where('uuid', $paymentId)->firstOrFail();
        $this->actingAs($this->cashier)->getJson("/api/v1/payments/{$payment->id}")->assertNotFound();
    }

    /** Provisoire (Q-08) : la caissière encaisse, mais seul l'administrateur annule ou rembourse. */
    /**
     * D-058 : la caissière corrige ses propres encaissements du jour (annulation motivée) ; les
     * encaissements d'une collègue ou des jours précédents, et tout remboursement, restent à
     * l'administrateur (provisoire, Q-08).
     */
    public function test_cashier_cancels_only_her_own_payments_of_the_day_and_never_refunds(): void
    {
        $own = $this->pay(20000)->json('data.id');
        $this->actingAs($this->cashier)->postJson("/api/v1/payments/{$own}/refunds", ['amount_fcfa' => 100, 'reason' => 'x'])->assertStatus(403);
        $this->actingAs($this->cashier)->postJson("/api/v1/payments/{$own}/cancel", ['reason' => 'Montant mal saisi'])
            ->assertOk()->assertJsonPath('data.status', 'CANCELLED');

        $colleague = User::factory()->cashier()->create();
        $theirs = $this->actingAs($colleague)->postJson("/api/v1/reservations/{$this->reservation}/payments", ['amount_fcfa' => 5000, 'method' => 'CASH'])->json('data.id');
        $this->actingAs($this->cashier)->postJson("/api/v1/payments/{$theirs}/cancel", ['reason' => 'x'])
            ->assertStatus(403)->assertJsonPath('code', 'payment_cancel_not_allowed');

        $yesterday = $this->pay(3000)->json('data.id');
        $this->travel(1)->days();
        $this->actingAs($this->cashier)->postJson("/api/v1/payments/{$yesterday}/cancel", ['reason' => 'x'])
            ->assertStatus(403)->assertJsonPath('code', 'payment_cancel_not_allowed');
        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$yesterday}/cancel", ['reason' => 'Erreur de la veille'])->assertOk();

        Role::findByName('caissiere', 'web')->revokePermissionTo('payments.record');
        $this->pay(1000)->assertStatus(403);
        $this->assertSame(2, AuditLog::query()->where('action', 'payment.cancelled')->count());
    }

    public function test_receipt_numbers_are_continuous_and_not_consumed_by_failures(): void
    {
        $this->pay(10000)->assertCreated();
        $this->pay(999999)->assertStatus(422);
        $this->pay(10000)->assertCreated()->assertJsonPath('data.receipt_number', 'REC-2026-000002');
    }
}
