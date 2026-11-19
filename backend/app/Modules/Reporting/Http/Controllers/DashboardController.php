<?php

namespace App\Modules\Reporting\Http\Controllers;

use App\Modules\Reporting\Application\Queries\DashboardQuery;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

final class DashboardController
{
    public function __invoke(DashboardQuery $dashboard): JsonResponse
    {
        return new JsonResponse(['data' => $dashboard->summary(CarbonImmutable::today())]);
    }
}
