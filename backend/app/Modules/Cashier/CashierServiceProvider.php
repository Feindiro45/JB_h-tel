<?php

namespace App\Modules\Cashier;

use App\Modules\Cashier\Contracts\PaymentHistory;
use App\Modules\Cashier\Infrastructure\EloquentPaymentHistory;
use Illuminate\Support\ServiceProvider;

final class CashierServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PaymentHistory::class, EloquentPaymentHistory::class);
    }
}
