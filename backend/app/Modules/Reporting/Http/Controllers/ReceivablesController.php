<?php

namespace App\Modules\Reporting\Http\Controllers;

use App\Modules\Reporting\Application\Queries\ReceivablesQuery;
use Illuminate\Http\JsonResponse;

final class ReceivablesController
{
    public function __invoke(ReceivablesQuery $receivables): JsonResponse
    {
        $rows = $receivables->rows();
        $toRefund = $receivables->toRefund();

        return new JsonResponse([
            'data' => $rows,
            'total_fcfa' => array_sum(array_column($rows, 'balance_fcfa')),
            // Annulations antérieures à D-053 encore à rembourser : affichées à part, jamais dans les soldes.
            'to_refund' => $toRefund,
            'to_refund_total_fcfa' => array_sum(array_column($toRefund, 'to_refund_fcfa')),
        ]);
    }
}
