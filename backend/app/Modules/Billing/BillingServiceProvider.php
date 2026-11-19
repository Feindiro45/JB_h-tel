<?php

namespace App\Modules\Billing;

use App\Modules\Billing\Contracts\InvoiceDocuments;
use App\Modules\Billing\Infrastructure\BillingStayInvoicing;
use App\Modules\Billing\Infrastructure\EloquentInvoiceDocuments;
use App\Modules\Reservations\Contracts\StayInvoicing;
use Illuminate\Support\ServiceProvider;

final class BillingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(InvoiceDocuments::class, EloquentInvoiceDocuments::class);
        // Port du module Reservations : avoir à l'annulation, facture remplacée à la prolongation (D-053).
        $this->app->bind(StayInvoicing::class, BillingStayInvoicing::class);
    }
}
