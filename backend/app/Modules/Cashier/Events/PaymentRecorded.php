<?php

namespace App\Modules\Cashier\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Événement métier émis après validation de la transaction (document 02). */
final class PaymentRecorded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $paymentId) {}
}
