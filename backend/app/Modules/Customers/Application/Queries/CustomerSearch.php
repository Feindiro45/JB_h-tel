<?php

namespace App\Modules\Customers\Application\Queries;

use App\Modules\Customers\DTO\CustomerFilters;
use App\Modules\Customers\Models\Customer;
use Illuminate\Database\Eloquent\Builder;

/** Recherche de clients, partagée par l'écran et l'export Excel ; ordre alphabétique. */
final class CustomerSearch
{
    /** @return Builder<Customer> */
    public function query(CustomerFilters $filters): Builder
    {
        $like = fn (string $value) => '%'.addcslashes($value, '%_\\').'%';

        return Customer::query()
            ->when($filters->search !== null, fn (Builder $q) => $q->matching((string) $filters->search))
            ->when($filters->email !== null, fn (Builder $q) => $q->where('email', 'like', $like((string) $filters->email)))
            ->when($filters->originCity !== null, fn (Builder $q) => $q->where('origin_city', 'like', $like((string) $filters->originCity)))
            ->when($filters->originCountry !== null, fn (Builder $q) => $q->where('origin_country', 'like', $like((string) $filters->originCountry)))
            ->orderBy('name')
            ->orderBy('first_name');
    }
}
