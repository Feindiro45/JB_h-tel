<?php

namespace App\Modules\Cashier\Http\Controllers;

use App\Modules\Cashier\Application\Queries\CashJournal;
use App\Modules\Cashier\Domain\PaymentMethods;
use App\Modules\Cashier\Domain\PaymentStatus;
use App\Modules\Cashier\Http\PaymentPresenter;
use App\Modules\Cashier\Models\Payment;
use App\Modules\Identity\Models\User;
use App\Shared\Http\PerPage;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Écrans « Caisse » (journal d'une période) et « Factures et reçus » (liste des reçus). */
final class CashJournalController
{
    /** Période maximale du journal ; les analyses plus longues relèvent des rapports (phase 7). */
    public const MAX_DAYS = 92;

    public function __construct(private readonly CashJournal $journal) {}

    public function journal(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'agent_id' => ['nullable', 'uuid', Rule::exists('users', 'uuid')],
        ], attributes: ['from' => 'date de début', 'to' => 'date de fin', 'agent_id' => 'agent']);

        $timezone = (string) config('app.timezone');
        $today = CarbonImmutable::now($timezone)->startOfDay();
        $from = isset($validated['from']) ? CarbonImmutable::parse($validated['from'], $timezone)->startOfDay() : $today;
        $to = isset($validated['to']) ? CarbonImmutable::parse($validated['to'], $timezone)->startOfDay() : $from;
        if ($from->diffInDays($to) >= self::MAX_DAYS) {
            throw ValidationException::withMessages([
                'to' => ['Le journal de caisse couvre au plus '.self::MAX_DAYS.' jours : réduisez la période, ou utilisez les rapports pour une analyse plus longue.'],
            ]);
        }

        return new JsonResponse(['data' => $this->journal->journal($from, $to->addDay(), self::agentId($validated['agent_id'] ?? null))]);
    }

    public function index(Request $request, PaymentMethods $methods): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'method' => ['nullable', 'string', Rule::in(array_values(array_unique(array_merge(array_keys(PaymentMethods::LABELS), $methods->accepted()))))],
            'status' => ['nullable', Rule::enum(PaymentStatus::class)],
            'agent_id' => ['nullable', 'uuid', Rule::exists('users', 'uuid')],
            'search' => ['nullable', 'string', 'max:80'],
        ], attributes: ['from' => 'date de début', 'to' => 'date de fin', 'method' => 'moyen de paiement', 'status' => 'statut', 'agent_id' => 'agent', 'search' => 'recherche']);

        $timezone = (string) config('app.timezone');
        $filters = array_filter([
            'from' => isset($validated['from']) ? CarbonImmutable::parse($validated['from'], $timezone)->startOfDay() : null,
            'until' => isset($validated['to']) ? CarbonImmutable::parse($validated['to'], $timezone)->startOfDay()->addDay() : null,
            'method' => $validated['method'] ?? null,
            'status' => $validated['status'] ?? null,
            'agent_id' => self::agentId($validated['agent_id'] ?? null),
            'search' => isset($validated['search']) ? trim((string) $validated['search']) : null,
        ], fn ($value) => $value !== null && $value !== '');

        $page = $this->journal->payments($filters, PerPage::from($request));
        /** @var list<Payment> $items */
        $items = $page->items();
        $context = $this->journal->context(array_map(fn (Payment $payment) => $payment->reservation_id, $items));

        return new JsonResponse([
            'data' => array_map(fn (Payment $payment) => PaymentPresenter::payment($payment)
                + ($context[$payment->reservation_id] ?? ['reservation' => null, 'customer' => null, 'room' => null]), $items),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    private static function agentId(?string $uuid): ?int
    {
        return $uuid === null ? null : User::query()->where('uuid', $uuid)->value('id');
    }
}
