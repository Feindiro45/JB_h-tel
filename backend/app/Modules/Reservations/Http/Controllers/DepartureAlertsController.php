<?php

namespace App\Modules\Reservations\Http\Controllers;

use App\Modules\Reservations\Application\Queries\DepartureAlerts;
use App\Shared\Http\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class DepartureAlertsController
{
    public function index(Request $request, DepartureAlerts $alerts): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:160'],
            'billing_unit' => ['nullable', 'in:DAY,HALF_DAY'],
            'page' => ['nullable', 'integer', 'min:1'],
        ], attributes: ['search' => 'recherche', 'billing_unit' => 'forfait', 'page' => 'page']);

        return new JsonResponse($alerts->listing($filters, PerPage::from($request)));
    }

    public function summary(DepartureAlerts $alerts): JsonResponse
    {
        return new JsonResponse(['data' => $alerts->summary()]);
    }
}
