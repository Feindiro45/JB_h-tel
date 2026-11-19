<?php

namespace App\Modules\Billing;

use App\Modules\Billing\Contracts\InvoiceDocuments;
use App\Modules\Billing\Infrastructure\EloquentInvoiceDocuments;
use Illuminate\Support\ServiceProvider;

final class BillingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(InvoiceDocuments::class, EloquentInvoiceDocuments::class);
    }
}
