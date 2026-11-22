<?php

namespace App\Modules\Customers\Http\Controllers;

use App\Modules\Customers\Application\Queries\CustomerSearch;
use App\Modules\Customers\Application\Services\CustomerService;
use App\Modules\Customers\Http\Requests\CustomerListRequest;
use App\Modules\Customers\Http\Requests\CustomerRequest;
use App\Modules\Customers\Http\Resources\CustomerResource;
use App\Modules\Customers\Models\Customer;
use App\Shared\Http\DeletionRequest;
use App\Shared\Http\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Écran « Clients » : recherche, création, fiche. L'historique est servi par Reservations. */
final class CustomerController
{
    public function __construct(private readonly CustomerService $customers) {}

    public function index(CustomerListRequest $request, CustomerSearch $search): AnonymousResourceCollection
    {
        $customers = $search->query($request->toData())
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
