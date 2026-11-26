<?php

namespace App\Modules\Reporting\Http\Controllers;

use App\Modules\Reporting\Http\Exports\AuditLogExport;
use App\Modules\Reporting\Http\Requests\AuditLogRequest;
use App\Shared\Export\Workbook;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Export Excel du journal d'audit, avec les filtres de l'écran. */
final class AuditLogExportController
{
    public function __invoke(AuditLogRequest $request, AuditLogExport $export): StreamedResponse
    {
        return $export->build($request->toData(), $request->user())->download(Workbook::filename(AuditLogExport::MODULE));
    }
}
