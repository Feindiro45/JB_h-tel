<?php

namespace App\Modules\Reporting\Http\Controllers;

use App\Modules\Reporting\Application\Queries\AuditLogQuery;
use App\Modules\Reporting\Http\Requests\AuditLogRequest;
use App\Shared\Http\PerPage;
use Illuminate\Http\JsonResponse;

/** Écran « Journal d'audit » de l'administration. */
final class AuditLogController
{
    public function __invoke(AuditLogRequest $request, AuditLogQuery $query): JsonResponse
    {
        ['rows' => $rows, 'page' => $page] = $query->page($request->toData(), PerPage::from($request));

        return new JsonResponse([
            'data' => $rows,
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
            'domains' => array_map(fn (string $value, string $label) => ['value' => $value, 'label' => $label], array_keys(AuditLogQuery::DOMAINS), AuditLogQuery::DOMAINS),
        ]);
    }
}
