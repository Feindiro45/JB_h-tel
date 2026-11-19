<?php

namespace App\Modules\Cashier\Application\Services;

use App\Modules\Cashier\Application\AccountSummary;
use App\Modules\Cashier\Domain\PaymentStatus;
use App\Modules\Cashier\Events\PaymentRecorded;
use App\Modules\Cashier\Models\Payment;
use App\Modules\Cashier\Models\Refund;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\ReservationDue;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Numbering\DocumentNumberer;
use App\Shared\Settings\SettingsRepository;
use App\Shared\Support\Format;
use Illuminate\Support\Facades\DB;

/**
 * Caisse (cahier des charges, « Réductions et paiement ») : paiement intégral, avance ou différé,
 * plusieurs encaissements par réservation, solde calculé, un reçu par paiement. Remboursement et
 * annulation d'encaissement sont tracés, jamais faits par suppression.
 *
 * Chaque opération verrouille la réservation (contrat `ReservationLedger`) : deux encaissements
 * simultanés ne peuvent pas ensemble dépasser le montant dû (D-014, pas de trop-perçu).
 */
final class CashierService
{
    public function __construct(
        private readonly ReservationLedger $reservations,
        private readonly DocumentNumberer $numbers,
        private readonly SettingsRepository $settings,
        private readonly AuditTrail $audit,
    ) {}

    public function summary(ReservationDue $reservation): AccountSummary
    {
        $payments = Payment::query()
            ->with('refunds')
            ->where('reservation_id', $reservation->id)
            ->where('status', PaymentStatus::Valid->value)
            ->get();

        return new AccountSummary(
            $reservation->amountDueFcfa(),
            (int) $payments->sum('amount_fcfa'),
            (int) $payments->sum(fn (Payment $payment) => $payment->refundedFcfa()),
        );
    }

    public function record(ReservationDue $reservation, int $amountFcfa, string $method, ?string $reference, User $actor): Payment
    {
        return DB::transaction(function () use ($reservation, $amountFcfa, $method, $reference, $actor): Payment {
            $reservation = $this->reservations->lockForPayment($reservation->id) ?? throw self::notFound();

            if ($reservation->cancelled) {
                throw new BusinessRuleException(
                    'Cette réservation est annulée : aucun encaissement ne peut y être enregistré.',
                    'Encaissement impossible',
                    409,
                    'reservation_cancelled',
                );
            }

            $summary = $this->summary($reservation);
            $allowOverpayment = (bool) $this->settings->get('billing.allow_overpayment', false);
            if (! $allowOverpayment && $amountFcfa > $summary->balanceFcfa()) {
                throw new BusinessRuleException(
                    'Le montant ('.Format::fcfa($amountFcfa).') dépasse le solde restant dû ('.Format::fcfa(max(0, $summary->balanceFcfa())).').',
                    'Montant trop élevé',
                    422,
                    'overpayment',
                    [
                        'Montant de la réservation : '.Format::fcfa($summary->amountDueFcfa).'.',
                        'Déjà encaissé (net) : '.Format::fcfa($summary->netPaidFcfa()).'.',
                        'Solde restant : '.Format::fcfa(max(0, $summary->balanceFcfa())).'.',
                    ],
                );
            }

            $payment = Payment::query()->create([
                'reservation_id' => $reservation->id,
                'receipt_number' => $this->numbers->next((string) $this->settings->string('billing.receipt_number_prefix', 'REC')),
                'amount_fcfa' => $amountFcfa,
                'method' => $method,
                'received_at' => now(),
                'cashier_id' => $actor->id,
                'status' => PaymentStatus::Valid,
                'reference' => $reference,
            ]);

            $this->audit->record('payment.recorded', 'payment', $payment->id, after: self::snapshot($payment) + [
                'reservation_uuid' => $reservation->uuid,
                'balance_after_fcfa' => $summary->balanceFcfa() - $amountFcfa,
            ], actorId: $actor->id);
            event(new PaymentRecorded($payment->id));

            return $payment;
        });
    }

    /** Annulation d'un encaissement saisi par erreur (administrateur, Q-08 provisoire). */
    public function cancel(Payment $payment, string $reason, User $actor): Payment
    {
        return DB::transaction(function () use ($payment, $reason, $actor): Payment {
            $this->reservations->lockForPayment($payment->reservation_id) ?? throw self::notFound();
            /** @var Payment $payment */
            $payment = Payment::query()->with('refunds')->lockForUpdate()->findOrFail($payment->id);

            if ($payment->status !== PaymentStatus::Valid) {
                throw new BusinessRuleException('Cet encaissement est déjà annulé.', 'Annulation impossible', 409, 'payment_already_cancelled');
            }
            if ($payment->refunds->isNotEmpty()) {
                throw new BusinessRuleException(
                    'Cet encaissement a déjà fait l’objet d’un remboursement : il ne peut plus être annulé.',
                    'Annulation impossible',
                    409,
                    'payment_has_refunds',
                );
            }

            $before = self::snapshot($payment);
            $payment->fill([
                'status' => PaymentStatus::Cancelled,
                'cancelled_at' => now(),
                'cancelled_by' => $actor->id,
                'cancellation_reason' => $reason,
            ])->save();
            $this->audit->record('payment.cancelled', 'payment', $payment->id, $before, self::snapshot($payment) + ['reason' => $reason], $actor->id);

            return $payment;
        });
    }

    /** Remboursement partiel ou total d'un encaissement (administrateur, Q-08 provisoire). */
    public function refund(Payment $payment, int $amountFcfa, ?string $method, string $reason, User $actor): Refund
    {
        return DB::transaction(function () use ($payment, $amountFcfa, $method, $reason, $actor): Refund {
            $this->reservations->lockForPayment($payment->reservation_id) ?? throw self::notFound();
            /** @var Payment $payment */
            $payment = Payment::query()->with('refunds')->lockForUpdate()->findOrFail($payment->id);

            if ($payment->status !== PaymentStatus::Valid) {
                throw new BusinessRuleException('Un encaissement annulé ne peut pas être remboursé.', 'Remboursement impossible', 409, 'payment_cancelled');
            }
            $alreadyRefunded = $payment->refundedFcfa();
            $refundable = $payment->amount_fcfa - $alreadyRefunded;
            if ($amountFcfa > $refundable) {
                throw new BusinessRuleException(
                    'Le remboursement ('.Format::fcfa($amountFcfa).') dépasse le montant encore remboursable sur ce reçu ('.Format::fcfa($refundable).').',
                    'Remboursement trop élevé',
                    422,
                    'refund_exceeds_payment',
                );
            }

            $refund = $payment->refunds()->create([
                'amount_fcfa' => $amountFcfa,
                'method' => $method,
                'reason' => $reason,
                'processed_by' => $actor->id,
                'processed_at' => now(),
            ]);
            $this->audit->record('payment.refunded', 'payment', $payment->id, ['refunded_fcfa' => $alreadyRefunded], [
                'refund_uuid' => $refund->uuid,
                'amount_fcfa' => $amountFcfa,
                'reason' => $reason,
                'refunded_fcfa' => $alreadyRefunded + $amountFcfa,
            ], $actor->id);

            return $refund;
        });
    }

    private static function notFound(): BusinessRuleException
    {
        return new BusinessRuleException("La réservation n'existe pas.", 'Élément introuvable', 404, 'reservation_not_found');
    }

    /** @return array<string, mixed> */
    private static function snapshot(Payment $payment): array
    {
        return [
            'receipt_number' => $payment->receipt_number,
            'amount_fcfa' => $payment->amount_fcfa,
            'method' => $payment->method,
            'status' => $payment->status->value,
            'reference' => $payment->reference,
        ];
    }
}
