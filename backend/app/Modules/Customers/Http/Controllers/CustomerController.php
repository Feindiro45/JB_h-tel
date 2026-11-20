<?php

namespace App\Modules\Customers\Http\Controllers;

use App\Modules\Customers\Application\Services\CustomerService;
use App\Modules\Customers\Http\Requests\CustomerRequest;
use App\Modules\Customers\Http\Resources\CustomerResource;
use App\Modules\Customers\Models\Customer;
use App\Shared\Http\DeletionRequest;
use App\Shared\Http\PerPage;
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
            ->when($search !== '', fn ($query) => $query->matching($search))
            ->when($request->filled('email'), fn ($q) => $q->where('email', 'like', '%'.$request->string('email')->trim()->toString().'%'))
            ->when($request->filled('origin_city'), fn ($q) => $q->where('origin_city', 'like', '%'.$request->string('origin_city')->trim()->toString().'%'))
            ->when($request->filled('origin_country'), fn ($q) => $q->where('origin_country', 'like', '%'.$request->string('origin_country')->trim()->toString().'%'))
            ->orderBy('name')
            ->orderBy('first_name')
            ->paginate(PerPage::from($request))
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

    /** Suppression définitive (D-058, administrateur) : motif obligatoire, copie au journal d'audit. */
    public function destroy(DeletionRequest $request, Customer $customer): JsonResponse
    {
        $this->customers->delete($customer, $request->reason(), $request->actor());

        return new JsonResponse(['message' => 'Fiche client supprimée. Une copie est conservée dans le journal d’audit.']);
    }
}
