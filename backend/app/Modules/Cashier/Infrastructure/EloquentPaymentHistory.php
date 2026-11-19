<?php

namespace App\Modules\Cashier\Infrastructure;

use App\Modules\Cashier\Contracts\PaymentHistory;
use App\Modules\Cashier\Contracts\PaymentLine;
use App\Modules\Cashier\Contracts\PaymentStatement;
use App\Modules\Cashier\Domain\PaymentMethods;
use App\Modules\Cashier\Domain\PaymentStatus;
use App\Modules\Cashier\Models\Payment;

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
}
