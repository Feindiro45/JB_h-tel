<?php

namespace App\Modules\Billing\Application\Queries;

use App\Modules\Billing\Domain\InvoiceType;
use App\Modules\Billing\Models\Invoice;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Liste des factures et avoirs (lecture seule). Le client, la chambre et la réservation affichés
 * viennent de l'**instantané figé** du document : ce qui a été facturé, pas l'état actuel.
 */
final class InvoiceList
{
    /**
     * @param  array{type?: string, status?: string, from?: CarbonImmutable, until?: CarbonImmutable, search?: string}  $filters
     * @return LengthAwarePaginator<int, Invoice>
     */
    public function page(array $filters, int $perPage = 25): LengthAwarePaginator
    {
        return $this->query($filters)->with('creditedInvoice')
            ->orderByDesc('issued_at')->orderByDesc('id')
            ->paginate($perPage);
    }

    /**
     * Totaux des documents filtrés : facturé = factures − avoirs (D-040).
     *
     * @param  array{type?: string, status?: string, from?: CarbonImmutable, until?: CarbonImmutable, search?: string}  $filters
     * @return array{invoices_fcfa: int, credit_notes_fcfa: int, net_invoiced_fcfa: int, count: int}
     */
    public function totals(array $filters): array
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
     * @param  array{type?: string, status?: string, from?: CarbonImmutable, until?: CarbonImmutable, search?: string}  $filters
     * @return Builder<Invoice>
     */
    private function query(array $filters): Builder
    {
        return Invoice::query()
            ->when(isset($filters['type']), fn (Builder $q) => $q->where('type', $filters['type']))
            ->when(isset($filters['status']), fn (Builder $q) => $q->where('status', $filters['status']))
            ->when(isset($filters['from']), fn (Builder $q) => $q->where('issued_at', '>=', $filters['from']))
            ->when(isset($filters['until']), fn (Builder $q) => $q->where('issued_at', '<', $filters['until']))
            ->when(isset($filters['search']), fn (Builder $q) => $q->where(
                'invoice_number', 'like', '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], (string) $filters['search']).'%',
            ));
    }
}
