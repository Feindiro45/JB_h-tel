<?php

namespace App\Modules\Cashier\Infrastructure;

use App\Modules\Cashier\Application\Services\CashierService;
use App\Modules\Cashier\Contracts\PaymentHistory;
use App\Modules\Cashier\Domain\PaymentMethods;
use App\Modules\Cashier\Domain\PaymentStatus;
use App\Modules\Cashier\Models\Payment;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\CancellationRefunds;

/**
 * Remboursement à l'annulation (D-053, choix de l'utilisateur du 19/11/2026) : chaque versement
 * encore remboursable est remboursé intégralement par le service de caisse (une ligne de
 * remboursement par reçu, audit et e-mail au client). Le versement d'origine reste intact.
 */
final class CashierCancellationRefunds implements CancellationRefunds
{
    public function __construct(
        private readonly CashierService $cashier,
        private readonly PaymentHistory $history,
        private readonly PaymentMethods $methods,
    ) {}

    public function netCollected(int $reservationId): int
    {
        return $this->history->forReservation($reservationId)->netPaidFcfa();
    }

    public function hasPayments(int $reservationId): bool
    {
        return Payment::query()->where('reservation_id', $reservationId)->exists();
    }

    public function acceptedMethods(): array
    {
        return $this->methods->accepted();
    }

    public function refundAll(int $reservationId, ?string $method, string $reason, User $actor): int
    {
        $total = 0;
        $payments = Payment::query()->with('refunds')
            ->where('reservation_id', $reservationId)
            ->where('status', PaymentStatus::Valid->value)
            ->orderBy('id')
            ->get();
        foreach ($payments as $payment) {
            $refundable = $payment->amount_fcfa - $payment->refundedFcfa();
            if ($refundable > 0) {
                $this->cashier->refund($payment, $refundable, $method, $reason, $actor);
                $total += $refundable;
            }
        }

        return $total;
    }
}
