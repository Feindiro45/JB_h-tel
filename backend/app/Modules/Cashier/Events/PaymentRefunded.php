<?php

namespace App\Modules\Cashier\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Remboursement enregistré. Émis après validation de la transaction. */
final class PaymentRefunded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $refundId) {}
}
