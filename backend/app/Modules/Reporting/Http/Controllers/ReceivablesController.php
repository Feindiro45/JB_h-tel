<?php

namespace App\Modules\Reporting\Http\Controllers;

use App\Modules\Reporting\Application\Queries\ReceivablesQuery;
use Illuminate\Http\JsonResponse;

final class ReceivablesController
{
    public function __invoke(ReceivablesQuery $receivables): JsonResponse
    {
        $rows = $receivables->rows();

        return new JsonResponse([
            'data' => $rows,
            'total_fcfa' => array_sum(array_column($rows, 'balance_fcfa')),
        ]);
    }
}
