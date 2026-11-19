<?php

namespace App\Modules\Customers\Application\Services;

use App\Modules\Customers\Models\Customer;
use App\Shared\Contracts\AuditTrail;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * Création et modification des fiches clients, tracées dans l'audit. Données personnelles :
 * seuls les champs utiles sont collectés ; aucune suppression (historique et facturation).
 */
final class CustomerService
{
    public function __construct(private readonly AuditTrail $audit) {}

    /** @param  array<string, string|bool|null>  $fields */
    public function create(array $fields): Customer
    {
        return DB::transaction(function () use ($fields): Customer {
            $customer = Customer::query()->create([
                ...Arr::only($fields, [...Customer::FIELDS, 'email_notifications']),
                'created_by' => auth()->id(),
            ]);
            $this->audit->record('customer.created', 'customer', $customer->id, after: $this->snapshot($customer));

            return $customer;
        });
    }

    /** @param  array<string, string|bool|null>  $fields  Seuls les champs présents sont modifiés. */
    public function update(Customer $customer, array $fields): Customer
    {
        return DB::transaction(function () use ($customer, $fields): Customer {
            $before = $this->snapshot($customer);
            $customer->fill(Arr::only($fields, [...Customer::FIELDS, 'email_notifications']))->save();
            $this->audit->record('customer.updated', 'customer', $customer->id, $before, $this->snapshot($customer));

            return $customer;
        });
    }

    /** @return array<string, mixed> */
    private function snapshot(Customer $customer): array
    {
        return Arr::only($customer->attributesToArray(), [...Customer::FIELDS, 'email_notifications']);
    }
}
