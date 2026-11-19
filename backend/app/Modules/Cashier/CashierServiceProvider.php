<?php

namespace App\Modules\Cashier;

use App\Modules\Cashier\Contracts\PaymentHistory;
use App\Modules\Cashier\Infrastructure\CashierCancellationRefunds;
use App\Modules\Cashier\Infrastructure\EloquentPaymentHistory;
use App\Modules\Reservations\Contracts\CancellationRefunds;
use Illuminate\Support\ServiceProvider;

final class CashierServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PaymentHistory::class, EloquentPaymentHistory::class);
        // Port du module Reservations : remboursement intégral à l'annulation (D-053).
        $this->app->bind(CancellationRefunds::class, CashierCancellationRefunds::class);
    }
}
