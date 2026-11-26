<?php

namespace App\Modules\Billing\Infrastructure;

use App\Modules\Billing\Application\Services\InvoiceService;
use App\Modules\Billing\Domain\InvoiceStatus;
use App\Modules\Billing\Domain\InvoiceType;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\InvoiceReference;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Modules\Reservations\Contracts\StayInvoicing;
use App\Shared\Exceptions\BusinessRuleException;

/**
 * Facturation d'un séjour qui change (D-053, choix de l'utilisateur du 19/11/2026) : à l'annulation,
 * la facture active est annulée par un avoir ; à la prolongation, elle est annulée par un avoir et
 * remplacée par une facture qui détaille le séjour initial et la prolongation. Ces avoirs découlent
 * de l'opération autorisée sur le séjour (annuler, prolonger) : ils ne demandent pas le droit
 * d'émettre un avoir libre. Appelé dans la transaction de l'opération.
 */
final class BillingStayInvoicing implements StayInvoicing
{
    public function __construct(
        private readonly InvoiceService $invoices,
        private readonly ReservationLedger $reservations,
    ) {}

    public function creditOnCancellation(int $reservationId, string $reason, User $actor): ?string
    {
        $active = $this->active($reservationId);

        return $active === null ? null : $this->invoices->credit($active, $reason, $actor)->invoice_number;
    }

    public function issueOnConfirmation(int $reservationId, User $actor): void
    {
        $due = $this->reservations->find($reservationId)
            ?? throw new BusinessRuleException("La réservation n'existe pas.", 'Élément introuvable', 404, 'reservation_not_found');
        $this->invoices->ensureIssued($due, $actor);
    }

    public function activeInvoiceReference(int $reservationId): ?InvoiceReference
    {
        $invoice = $this->active($reservationId);

        return $invoice === null ? null : new InvoiceReference($invoice->uuid, $invoice->invoice_number);
    }

    public function replaceAfterExtension(int $reservationId, User $actor): ?string
    {
        return $this->replaceAfterChange($reservationId, 'Prolongation du séjour : la nouvelle facture détaille le séjour initial et la prolongation.', $actor);
    }

    public function hasActiveInvoice(int $reservationId): bool
    {
        return $this->active($reservationId) !== null;
    }

    public function hasDocuments(int $reservationId): bool
    {
        return Invoice::query()->where('reservation_id', $reservationId)->exists();
    }

    public function replaceAfterChange(int $reservationId, string $reason, User $actor): ?string
    {
        $active = $this->active($reservationId);
        if ($active === null) {
            return null;
        }
        $this->invoices->credit($active, $reason, $actor);
        $due = $this->reservations->find($reservationId)
            ?? throw new BusinessRuleException("La réservation n'existe pas.", 'Élément introuvable', 404, 'reservation_not_found');

        return $this->invoices->issue($due, $actor, ['invoice_number' => $active->invoice_number, 'reason' => $reason])->invoice_number;
    }

    private function active(int $reservationId): ?Invoice
    {
        return Invoice::query()
            ->where('reservation_id', $reservationId)
            ->where('type', InvoiceType::Invoice->value)
            ->where('status', InvoiceStatus::Issued->value)
            ->first();
    }
}
