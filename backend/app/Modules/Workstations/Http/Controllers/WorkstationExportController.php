<?php

namespace App\Modules\Workstations\Http\Controllers;

use App\Modules\Workstations\Http\Exports\OfflineOperationsExport;
use App\Modules\Workstations\Http\Exports\WorkstationsExport;
use App\Modules\Workstations\Http\Requests\OfflineOperationsRequest;
use App\Modules\Workstations\Models\Workstation;
use App\Shared\Export\Workbook;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Exports Excel de l'administration des postes : « Postes de caisse » et « Mode hors ligne ». */
final class WorkstationExportController
{
    public function stations(Request $request, WorkstationsExport $export): StreamedResponse
    {
        $self = Workstation::findByToken($request->header(Workstation::HEADER));

        return $export->build($self, $request->user())->download(Workbook::filename(WorkstationsExport::MODULE));
    }

    public function offline(OfflineOperationsRequest $request, OfflineOperationsExport $export): StreamedResponse
    {
        return $export->build($request->toData(), $request->user())->download(Workbook::filename(OfflineOperationsExport::MODULE));
    }
}
