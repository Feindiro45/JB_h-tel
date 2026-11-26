<?php

namespace App\Modules\Billing\Application\Queries;

use App\Modules\Billing\Domain\InvoiceType;
use App\Modules\Billing\DTO\InvoiceFilters;
use App\Modules\Billing\Models\Invoice;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Liste des factures et avoirs (lecture seule). Le client, la chambre et la réservation affichés
 * viennent de l'**instantané figé** du document : ce qui a été facturé, pas l'état actuel.
 */
final class InvoiceList
{
    /**
     * @return LengthAwarePaginator<int, Invoice>
     */
    public function page(InvoiceFilters $filters, int $perPage = 25): LengthAwarePaginator
    {
        return $this->query($filters)->with('creditedInvoice')
            ->orderByDesc('issued_at')->orderByDesc('id')
            ->paginate($perPage);
    }

    /**
     * Tous les documents filtrés (export Excel), du plus récent au plus ancien.
     *
     * @return list<Invoice>
     */
    public function all(InvoiceFilters $filters, int $limit): array
    {
        return $this->query($filters)->with('creditedInvoice')
            ->orderByDesc('issued_at')->orderByDesc('id')
            ->limit($limit)->get()->all();
    }

    /**
     * Totaux des documents filtrés : facturé = factures − avoirs (D-040).
     *
     * @return array{invoices_fcfa: int, credit_notes_fcfa: int, net_invoiced_fcfa: int, count: int}
     */
    public function totals(InvoiceFilters $filters): array
    {
        $sum = fn (InvoiceType $type) => (int) $this->query($filters)->where('type', $type->value)->sum('net_fcfa');
        $invoices = $sum(InvoiceType::Invoice);
        $credits = $sum(InvoiceType::CreditNote);

        return [
            'invoices_fcfa' => $invoices,
            'credit_notes_fcfa' => $credits,
            'net_invoiced_fcfa' => $invoices - $credits,
            'count' => $this->query($filters)->count(),
        ];
    }

    /** @return array{reservation: array{id: string}|null, customer: array{full_name: string}|null, room: array{number: string, type: string|null}|null} */
    public static function context(Invoice $invoice): array
    {
        $snapshot = $invoice->snapshot_json;
        $reservationUuid = data_get($snapshot, 'stay.reservation_uuid');
        $customer = data_get($snapshot, 'customer.full_name');
        $room = data_get($snapshot, 'room.number');

        return [
            'reservation' => is_string($reservationUuid) ? ['id' => $reservationUuid] : null,
            'customer' => is_string($customer) ? ['full_name' => $customer] : null,
            'room' => is_string($room) ? ['number' => $room, 'type' => is_string($type = data_get($snapshot, 'room.type')) ? $type : null] : null,
        ];
    }

    /**
     * @return Builder<Invoice>
     */
    private function query(InvoiceFilters $filters): Builder
    {
        return Invoice::query()
            ->when($filters->type !== null, fn (Builder $q) => $q->where('type', $filters->type?->value))
            ->when($filters->status !== null, fn (Builder $q) => $q->where('status', $filters->status?->value))
            ->when($filters->from !== null, fn (Builder $q) => $q->where('issued_at', '>=', $filters->from))
            ->when($filters->until !== null, fn (Builder $q) => $q->where('issued_at', '<', $filters->until))
            ->when($filters->search !== null, function (Builder $q) use ($filters): void {
                $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], (string) $filters->search).'%';
                $q->where(fn (Builder $w) => $w->where('invoice_number', 'like', $term)->orWhere('snapshot_json->customer->full_name', 'like', $term));
            });
    }
}
