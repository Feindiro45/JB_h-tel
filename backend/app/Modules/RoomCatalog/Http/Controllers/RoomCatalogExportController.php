<?php

namespace App\Modules\RoomCatalog\Http\Controllers;

use App\Modules\RoomCatalog\Http\Exports\RoomCatalogExport;
use App\Shared\Export\Workbook;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Export Excel « Chambres et tarifs » ; la feuille des tarifs exige le droit de les consulter. */
final class RoomCatalogExportController
{
    public function __invoke(Request $request, RoomCatalogExport $export): StreamedResponse
    {
        $withRates = (bool) $request->user()?->can('rates.view');

        return $export->build($withRates, $request->user())->download(Workbook::filename(RoomCatalogExport::MODULE));
    }
}
