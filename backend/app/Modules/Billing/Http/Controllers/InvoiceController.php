<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Application\InvoicePdfRenderer;
use App\Modules\Billing\Application\Services\InvoiceService;
use App\Modules\Billing\Http\InvoicePresenter;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\ReservationDue;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Écran « Factures et reçus » : liste, émission, avoir, PDF A4 généré côté serveur (source de vérité). */
final class InvoiceController
{
    public function __construct(
        private readonly InvoiceService $invoices,
        private readonly ReservationLedger $reservations,
    ) {}

    public function index(string $reservation): JsonResponse
    {
        $due = $this->reservation($reservation);
        $invoices = Invoice::query()->with('creditedInvoice')->where('reservation_id', $due->id)->orderBy('id')->get();

        return new JsonResponse(['data' => $invoices->map(fn (Invoice $i) => InvoicePresenter::invoice($i, false))->values()->all()]);
    }

    public function store(Request $request, string $reservation): JsonResponse
    {
        $invoice = $this->invoices->issue($this->reservation($reservation), $this->actor($request));

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

    /** PDF A4 construit uniquement à partir de l'instantané figé : il est identique à chaque impression. */
    public function pdf(Invoice $invoice, InvoicePdfRenderer $renderer): Response
    {
        return $renderer->document($invoice)->stream($invoice->invoice_number.'.pdf');
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
