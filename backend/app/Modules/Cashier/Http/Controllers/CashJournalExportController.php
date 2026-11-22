<?php

namespace App\Modules\Cashier\Http\Controllers;

use App\Modules\Cashier\Http\Exports\CashJournalExport;
use App\Modules\Cashier\Http\Requests\CashJournalRequest;
use App\Shared\Export\Workbook;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Export Excel de la caisse, sur la période et l'agent de l'écran. */
final class CashJournalExportController
{
    public function __invoke(CashJournalRequest $request, CashJournalExport $export): StreamedResponse
    {
        return $export->build($request->toData(), $request->user())->download(Workbook::filename(CashJournalExport::MODULE));
    }
}
