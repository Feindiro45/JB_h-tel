<?php

namespace App\Modules\Customers\Http\Controllers;

use App\Modules\Customers\Http\Exports\CustomersExport;
use App\Modules\Customers\Http\Requests\CustomerListRequest;
use App\Shared\Export\Workbook;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Export Excel des clients, avec les filtres de l'écran. */
final class CustomerExportController
{
    public function __invoke(CustomerListRequest $request, CustomersExport $export): StreamedResponse
    {
        return $export->build($request->toData(), $request->user())->download(Workbook::filename(CustomersExport::MODULE));
    }
}
