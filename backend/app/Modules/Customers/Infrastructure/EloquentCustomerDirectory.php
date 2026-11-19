<?php

namespace App\Modules\Customers\Infrastructure;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Customers\Contracts\CustomerSnapshot;
use App\Modules\Customers\Models\Customer;
use Illuminate\Support\Str;

final class EloquentCustomerDirectory implements CustomerDirectory
{
    public function find(int $customerId): ?CustomerSnapshot
    {
        $customer = Customer::query()->find($customerId);

        return $customer === null ? null : $this->toSnapshot($customer);
    }

    public function findByUuid(string $uuid): ?CustomerSnapshot
    {
        if (! Str::isUuid($uuid)) {
            return null;
        }
        $customer = Customer::query()->where('uuid', $uuid)->first();

        return $customer === null ? null : $this->toSnapshot($customer);
    }

    public function findMany(array $customerIds): array
    {
        if ($customerIds === []) {
            return [];
        }

        return Customer::query()->whereKey(array_values(array_unique($customerIds)))->get()
            ->mapWithKeys(fn (Customer $customer) => [$customer->id => $this->toSnapshot($customer)])
            ->all();
    }

    private function toSnapshot(Customer $customer): CustomerSnapshot
    {
        return new CustomerSnapshot($customer->id, $customer->uuid, $customer->fullName(), $customer->phone, $customer->address, $customer->email);
    }
}
