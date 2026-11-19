<?php

namespace App\Modules\Cashier\Http;

use App\Modules\Cashier\Domain\PaymentMethods;
use App\Modules\Cashier\Models\Payment;
use App\Modules\Cashier\Models\Refund;

/** Représentation JSON des encaissements et reçus. Identifiants exposés : UUID seulement (D-026). */
final class PaymentPresenter
{
    /** @return array<string, mixed> */
    public static function payment(Payment $payment): array
    {
        $payment->loadMissing(['refunds.processor', 'cashier']);

        return [
            'id' => $payment->uuid,
            'receipt_number' => $payment->receipt_number,
            'amount_fcfa' => $payment->amount_fcfa,
            'refunded_fcfa' => $payment->refundedFcfa(),
            'method' => $payment->method,
            'method_label' => PaymentMethods::label($payment->method),
            'reference' => $payment->reference,
            'received_at' => $payment->received_at->toIso8601String(),
            'cashier' => ['id' => $payment->cashier->uuid, 'name' => $payment->cashier->name],
            'status' => $payment->status->value,
            'status_label' => $payment->status->label(),
            'cancelled_at' => $payment->cancelled_at?->toIso8601String(),
            'cancellation_reason' => $payment->cancellation_reason,
            'refunds' => $payment->refunds->map(fn (Refund $refund) => self::refund($refund))->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    public static function refund(Refund $refund): array
    {
        $refund->loadMissing('processor');

        return [
            'id' => $refund->uuid,
            'amount_fcfa' => $refund->amount_fcfa,
            'method' => $refund->method,
            'method_label' => $refund->method === null ? null : PaymentMethods::label($refund->method),
            'reason' => $refund->reason,
            'processed_at' => $refund->processed_at->toIso8601String(),
            'processed_by' => ['id' => $refund->processor->uuid, 'name' => $refund->processor->name],
        ];
    }
}
