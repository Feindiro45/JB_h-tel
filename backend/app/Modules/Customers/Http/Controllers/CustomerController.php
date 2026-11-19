<?php

namespace App\Modules\Customers\Http\Controllers;

use App\Modules\Customers\Application\Services\CustomerService;
use App\Modules\Customers\Http\Requests\CustomerRequest;
use App\Modules\Customers\Http\Resources\CustomerResource;
use App\Modules\Customers\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Écran « Clients » : recherche, création, fiche. L'historique est servi par Reservations. */
final class CustomerController
{
    public function __construct(private readonly CustomerService $customers) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $search = $request->string('search')->trim()->toString();

        $customers = Customer::query()
            ->when($search !== '', fn ($query) => $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('first_name', 'like', "%{$search}%")
                ->orWhere('phone', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
                ->orWhere('identification_number', 'like', "%{$search}%")))
            ->orderBy('name')
            ->orderBy('first_name')
            ->paginate(25)
            ->withQueryString();

        return CustomerResource::collection($customers);
    }

    public function store(CustomerRequest $request): JsonResponse
    {
        return (new CustomerResource($this->customers->create($request->fields())))->response()->setStatusCode(201);
    }

    public function show(Customer $customer): CustomerResource
    {
        return new CustomerResource($customer);
    }

    public function update(CustomerRequest $request, Customer $customer): CustomerResource
    {
        return new CustomerResource($this->customers->update($customer, $request->fields()));
    }
}
