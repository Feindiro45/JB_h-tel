<?php

namespace App\Modules\Reservations\Http\Controllers;

use App\Modules\Reservations\Http\Exports\ReservationsExport;
use App\Modules\Reservations\Http\Requests\ReservationListRequest;
use App\Shared\Export\Workbook;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Export Excel des réservations, avec les filtres de l'écran. */
final class ReservationExportController
{
    public function __invoke(ReservationListRequest $request, ReservationsExport $export): StreamedResponse
    {
        return $export->build($request->toData(), $request->user())->download(Workbook::filename(ReservationsExport::MODULE));
    }
}
