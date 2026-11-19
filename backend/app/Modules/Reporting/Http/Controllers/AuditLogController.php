<?php

namespace App\Modules\Reporting\Http\Controllers;

use App\Modules\Identity\Models\User;
use App\Modules\Reporting\Application\Queries\AuditLogQuery;
use App\Shared\Http\PerPage;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Écran « Journal d'audit » de l'administration. */
final class AuditLogController
{
    public function __invoke(Request $request, AuditLogQuery $query): JsonResponse
    {
        $validated = $request->validate([
            'domain' => ['nullable', Rule::in(array_keys(AuditLogQuery::DOMAINS))],
            'actor_id' => ['nullable', 'uuid', Rule::exists('users', 'uuid')],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ], attributes: ['domain' => 'domaine', 'actor_id' => 'auteur', 'from' => 'date de début', 'to' => 'date de fin']);

        $timezone = (string) config('app.timezone');
        $filters = array_filter([
            'domain' => $validated['domain'] ?? null,
            'actor_id' => isset($validated['actor_id']) ? User::query()->where('uuid', $validated['actor_id'])->value('id') : null,
            'from' => isset($validated['from']) ? CarbonImmutable::parse($validated['from'], $timezone)->startOfDay() : null,
            'until' => isset($validated['to']) ? CarbonImmutable::parse($validated['to'], $timezone)->startOfDay()->addDay() : null,
        ], fn ($value) => $value !== null);

        ['rows' => $rows, 'page' => $page] = $query->page($filters, PerPage::from($request));

        return new JsonResponse([
            'data' => $rows,
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
            'domains' => array_map(fn (string $value, string $label) => ['value' => $value, 'label' => $label], array_keys(AuditLogQuery::DOMAINS), AuditLogQuery::DOMAINS),
        ]);
    }
}
