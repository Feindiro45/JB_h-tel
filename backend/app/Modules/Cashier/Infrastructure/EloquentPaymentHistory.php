<?php

namespace App\Modules\Cashier\Infrastructure;

use App\Modules\Cashier\Contracts\PaymentHistory;
use App\Modules\Cashier\Contracts\PaymentLine;
use App\Modules\Cashier\Contracts\PaymentReceipt;
use App\Modules\Cashier\Contracts\PaymentStatement;
use App\Modules\Cashier\Domain\PaymentMethods;
use App\Modules\Cashier\Domain\PaymentStatus;
use App\Modules\Cashier\Models\Payment;
use App\Modules\Cashier\Models\Refund;

final class EloquentPaymentHistory implements PaymentHistory
{
    public function forReservation(int $reservationId): PaymentStatement
    {
        $payments = Payment::query()
            ->with('refunds')
            ->where('reservation_id', $reservationId)
            ->where('status', PaymentStatus::Valid->value)
            ->orderBy('id')
            ->get();

        $lines = $payments->map(fn (Payment $payment) => new PaymentLine(
            $payment->receipt_number,
            $payment->received_at->toImmutable(),
            $payment->amount_fcfa,
            PaymentMethods::label($payment->method),
            $payment->refundedFcfa(),
        ))->values()->all();

        return new PaymentStatement(
            $lines,
            (int) $payments->sum('amount_fcfa'),
            (int) $payments->sum(fn (Payment $payment) => $payment->refundedFcfa()),
        );
    }

    public function receipt(int $paymentId): ?PaymentReceipt
    {
        $payment = Payment::query()->find($paymentId);

        return $payment === null ? null : new PaymentReceipt(
            $payment->reservation_id,
            $payment->receipt_number,
            $payment->amount_fcfa,
            PaymentMethods::label($payment->method),
            $payment->received_at->toImmutable(),
        );
    }

    public function refund(int $refundId): ?PaymentReceipt
    {
        $refund = Refund::query()->find($refundId);
        $payment = $refund === null ? null : Payment::query()->find($refund->payment_id);

        return $refund === null || $payment === null ? null : new PaymentReceipt(
            $payment->reservation_id,
            $payment->receipt_number,
            $refund->amount_fcfa,
            $refund->method === null ? PaymentMethods::label($payment->method) : PaymentMethods::label($refund->method),
            $refund->processed_at->toImmutable(),
            $refund->reason,
        );
    }
}
