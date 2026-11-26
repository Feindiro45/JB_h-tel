<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Application\Queries\InvoiceList;
use App\Modules\Billing\Application\Services\InvoiceService;
use App\Modules\Billing\Http\InvoicePresenter;
use App\Modules\Billing\Http\Requests\InvoiceListRequest;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\ReservationDue;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Http\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Écran « Factures et reçus » : liste, émission, avoir (le ticket 80 mm remplace le PDF A4, D-065). */
final class InvoiceController
{
    public function __construct(
        private readonly InvoiceService $invoices,
        private readonly ReservationLedger $reservations,
    ) {}

    /** Tous les documents (écran « Factures et reçus »), filtrables, avec leurs totaux. */
    public function all(InvoiceListRequest $request, InvoiceList $list): JsonResponse
    {
        $filters = $request->toData();
        $page = $list->page($filters, PerPage::from($request));
        /** @var list<Invoice> $items */
        $items = $page->items();

        return new JsonResponse([
            'data' => array_map(fn (Invoice $invoice) => InvoicePresenter::invoice($invoice, false) + InvoiceList::context($invoice), $items),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
            'totals' => $list->totals($filters),
        ]);
    }

    public function index(string $reservation): JsonResponse
    {
        $due = $this->reservation($reservation);
        $invoices = Invoice::query()->with('creditedInvoice')->where('reservation_id', $due->id)->orderBy('id')->get();

        return new JsonResponse(['data' => $invoices->map(fn (Invoice $i) => InvoicePresenter::invoice($i, false))->values()->all()]);
    }

    public function store(Request $request, string $reservation): JsonResponse
    {
        $invoice = $this->invoices->ensureIssued($this->reservation($reservation), $this->actor($request));

        return new JsonResponse(['data' => InvoicePresenter::invoice($invoice)], 201);
    }

    public function show(Invoice $invoice): JsonResponse
    {
        return new JsonResponse(['data' => InvoicePresenter::invoice($invoice)]);
    }

    public function credit(Request $request, Invoice $invoice): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'max:255']], attributes: ['reason' => "motif de l'avoir"]);
        $creditNote = $this->invoices->credit($invoice, trim((string) $validated['reason']), $this->actor($request));

        return new JsonResponse(['data' => InvoicePresenter::invoice($creditNote)], 201);
    }

    private function reservation(string $uuid): ReservationDue
    {
        return $this->reservations->findByUuid($uuid) ?? throw new BusinessRuleException(
            "La réservation demandée n'existe pas.", 'Élément introuvable', 404, 'reservation_not_found',
        );
    }

    private function actor(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user;
    }
}
