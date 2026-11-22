<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Http\Exports\InvoicesExport;
use App\Modules\Billing\Http\Requests\InvoiceListRequest;
use App\Shared\Export\Workbook;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Export Excel des factures et avoirs, avec les filtres de l'écran. */
final class InvoiceExportController
{
    public function __invoke(InvoiceListRequest $request, InvoicesExport $export): StreamedResponse
    {
        return $export->build($request->toData(), $request->user())->download(Workbook::filename(InvoicesExport::MODULE));
    }
}
