<?php

namespace App\Modules\Customers;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Customers\Infrastructure\EloquentCustomerDirectory;
use Illuminate\Support\ServiceProvider;

final class CustomersServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(CustomerDirectory::class, EloquentCustomerDirectory::class);
    }
}
