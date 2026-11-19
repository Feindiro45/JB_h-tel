<?php

namespace App\Modules\Cashier\Application\Queries;

use App\Modules\Cashier\Domain\PaymentMethods;
use App\Modules\Cashier\Domain\PaymentStatus;
use App\Modules\Cashier\Models\Payment;
use App\Modules\Cashier\Models\Refund;
use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Journal de caisse et liste des reçus (lecture seule). Définitions (D-041), identiques au
 * tableau de bord (D-040) :
 * - **encaissé** = versements au statut « valide », par date de réception ;
 * - **remboursé** = remboursements, par date de traitement ;
 * - **net** = encaissé − remboursé ;
 * - un versement **annulé** reste listé pour la traçabilité, mais n'est compté dans aucun total.
 *
 * Le client et la chambre sont lus par les contrats publics des autres modules (une requête
 * groupée par module, jamais une par ligne).
 */
final class CashJournal
{
    public function __construct(
        private readonly ReservationLedger $reservations,
        private readonly CustomerDirectory $customers,
        private readonly RoomDirectory $rooms,
    ) {}

    /**
     * @param  CarbonImmutable  $from  début inclus
     * @param  CarbonImmutable  $until  fin exclue
     * @return array<string, mixed>
     */
    public function journal(CarbonImmutable $from, CarbonImmutable $until, ?int $agentId): array
    {
        $payments = Payment::query()->with(['cashier', 'refunds'])
            ->where('received_at', '>=', $from)->where('received_at', '<', $until)
            ->when($agentId !== null, fn (Builder $query) => $query->where('cashier_id', $agentId))
            ->orderBy('received_at')->orderBy('id')->get();
        $refunds = Refund::query()->with(['processor', 'payment'])
            ->where('processed_at', '>=', $from)->where('processed_at', '<', $until)
            ->when($agentId !== null, fn (Builder $query) => $query->where('processed_by', $agentId))
            ->orderBy('processed_at')->orderBy('id')->get();

        $context = $this->context(array_merge(
            $payments->pluck('reservation_id')->all(),
            $refunds->map(fn (Refund $refund) => $refund->payment->reservation_id)->all(),
        ));

        $movements = [];
        $byMethod = [];
        $byAgent = [];
        $totals = ['collected_fcfa' => 0, 'refunded_fcfa' => 0, 'cancelled_fcfa' => 0, 'payments_count' => 0, 'refunds_count' => 0];

        foreach ($payments as $payment) {
            $counted = $payment->status === PaymentStatus::Valid;
            if ($counted) {
                $totals['collected_fcfa'] += $payment->amount_fcfa;
                $totals['payments_count']++;
                self::add($byMethod, $payment->method, PaymentMethods::label($payment->method), 'collected_fcfa', $payment->amount_fcfa);
                self::add($byAgent, $payment->cashier->uuid, $payment->cashier->name, 'collected_fcfa', $payment->amount_fcfa);
            } else {
                $totals['cancelled_fcfa'] += $payment->amount_fcfa;
            }
            $movements[] = [
                'type' => 'PAYMENT',
                'type_label' => 'Encaissement',
                'id' => $payment->uuid,
                'payment_id' => $payment->uuid,
                'receipt_number' => $payment->receipt_number,
                'at' => $payment->received_at->toIso8601String(),
                'amount_fcfa' => $payment->amount_fcfa,
                'signed_amount_fcfa' => $counted ? $payment->amount_fcfa : 0,
                'counted' => $counted,
                'method' => $payment->method,
                'method_label' => PaymentMethods::label($payment->method),
                'agent' => ['id' => $payment->cashier->uuid, 'name' => $payment->cashier->name],
                'status' => $payment->status->value,
                'status_label' => $payment->status->label(),
                'reason' => $payment->cancellation_reason,
                'refundable_fcfa' => $counted ? $payment->amount_fcfa - $payment->refundedFcfa() : 0,
                'has_refunds' => $payment->refunds->isNotEmpty(),
            ] + ($context[$payment->reservation_id] ?? self::unknown());
        }

        foreach ($refunds as $refund) {
            // Sans moyen précisé, le remboursement sort par le moyen du versement d'origine.
            $method = $refund->method ?? $refund->payment->method;
            $totals['refunded_fcfa'] += $refund->amount_fcfa;
            $totals['refunds_count']++;
            self::add($byMethod, $method, PaymentMethods::label($method), 'refunded_fcfa', $refund->amount_fcfa);
            self::add($byAgent, $refund->processor->uuid, $refund->processor->name, 'refunded_fcfa', $refund->amount_fcfa);
            $movements[] = [
                'type' => 'REFUND',
                'type_label' => 'Remboursement',
                'id' => $refund->uuid,
                'payment_id' => $refund->payment->uuid,
                'receipt_number' => $refund->payment->receipt_number,
                'at' => $refund->processed_at->toIso8601String(),
                'amount_fcfa' => $refund->amount_fcfa,
                'signed_amount_fcfa' => -$refund->amount_fcfa,
                'counted' => true,
                'method' => $method,
                'method_label' => PaymentMethods::label($method),
                'agent' => ['id' => $refund->processor->uuid, 'name' => $refund->processor->name],
                'status' => 'VALID',
                'status_label' => 'Remboursé',
                'reason' => $refund->reason,
                'refundable_fcfa' => 0,
                'has_refunds' => false,
            ] + ($context[$refund->payment->reservation_id] ?? self::unknown());
        }

        usort($movements, fn (array $a, array $b) => [$a['at'], $a['type']] <=> [$b['at'], $b['type']]);

        return [
            'from' => $from->toDateString(),
            'to' => $until->subDay()->toDateString(),
            'totals' => $totals + ['net_fcfa' => $totals['collected_fcfa'] - $totals['refunded_fcfa']],
            'by_method' => self::finish($byMethod, 'method'),
            'by_agent' => self::finish($byAgent, 'id'),
            'movements' => $movements,
        ];
    }

    /**
     * Reçus (encaissements), du plus récent au plus ancien.
     *
     * @param  array{from?: CarbonImmutable, until?: CarbonImmutable, method?: string, status?: string, agent_id?: int, search?: string}  $filters
     * @return LengthAwarePaginator<int, Payment>
     */
    public function payments(array $filters, int $perPage = 25): LengthAwarePaginator
    {
        return Payment::query()->with(['cashier', 'refunds.processor'])
            ->when(isset($filters['from']), fn (Builder $q) => $q->where('received_at', '>=', $filters['from']))
            ->when(isset($filters['until']), fn (Builder $q) => $q->where('received_at', '<', $filters['until']))
            ->when(isset($filters['method']), fn (Builder $q) => $q->where('method', $filters['method']))
            ->when(isset($filters['status']), fn (Builder $q) => $q->where('status', $filters['status']))
            ->when(isset($filters['agent_id']), fn (Builder $q) => $q->where('cashier_id', $filters['agent_id']))
            ->when(isset($filters['search']), function (Builder $q) use ($filters): void {
                $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], (string) $filters['search']).'%';
                $ids = $this->reservations->idsForCustomers($this->customers->searchIds((string) $filters['search']));
                $q->where(fn (Builder $w) => $w->where('receipt_number', 'like', $term)->orWhere('reference', 'like', $term)->orWhereIn('reservation_id', $ids));
            })
            ->orderByDesc('received_at')->orderByDesc('id')
            ->paginate($perPage);
    }

    /**
     * Réservation, client et chambre de chaque réservation citée, en identifiants publics.
     *
     * @param  list<int>  $reservationIds
     * @return array<int, array{reservation: array<string, string>, customer: array<string, string>|null, room: array<string, string>|null}>
     */
    public function context(array $reservationIds): array
    {
        $dues = $this->reservations->findMany(array_values(array_unique($reservationIds)));
        $customers = $this->customers->findMany(array_values(array_unique(array_map(fn ($due) => $due->customerId, $dues))));
        $rooms = [];
        foreach ($this->rooms->all() as $room) {
            $rooms[$room->id] = $room;
        }

        $context = [];
        foreach ($dues as $id => $due) {
            $customer = $customers[$due->customerId] ?? null;
            $room = $rooms[$due->roomId] ?? null;
            $context[$id] = [
                'reservation' => ['id' => $due->uuid, 'status' => $due->status, 'status_label' => $due->statusLabel],
                'customer' => $customer === null ? null : ['id' => $customer->uuid, 'full_name' => $customer->fullName],
                'room' => $room === null ? null : ['id' => $room->uuid, 'number' => $room->number, 'room_type' => $room->roomTypeLabel],
            ];
        }

        return $context;
    }

    /** @return array{reservation: null, customer: null, room: null} */
    private static function unknown(): array
    {
        return ['reservation' => null, 'customer' => null, 'room' => null];
    }

    /** @param  array<string, array<string, mixed>>  $groups */
    private static function add(array &$groups, string $key, string $label, string $field, int $amount): void
    {
        $groups[$key] ??= ['key' => $key, 'label' => $label, 'collected_fcfa' => 0, 'refunded_fcfa' => 0];
        $groups[$key][$field] += $amount;
    }

    /**
     * @param  array<string, array<string, mixed>>  $groups
     * @return list<array<string, mixed>>
     */
    private static function finish(array $groups, string $keyName): array
    {
        $rows = array_map(fn (array $group) => [
            $keyName => $group['key'],
            'label' => $group['label'],
            'collected_fcfa' => $group['collected_fcfa'],
            'refunded_fcfa' => $group['refunded_fcfa'],
            'net_fcfa' => $group['collected_fcfa'] - $group['refunded_fcfa'],
        ], array_values($groups));
        usort($rows, fn (array $a, array $b) => $b['net_fcfa'] <=> $a['net_fcfa']);

        return $rows;
    }
}
