<?php

namespace App\Modules\Reporting\Application\Queries;

use App\Modules\Reservations\Domain\ReservationStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Tableau de bord de la réception (document 02 : « Reporting lit des projections ou requêtes
 * dédiées, sans modifier les transactions »). Lecture seule.
 *
 * Indicateurs **distincts** (cahier des charges : ne pas confondre facturé et encaissé) :
 * - encaissé net = versements validés − remboursements, par date de mouvement ;
 * - facturé = factures émises − avoirs, par date d'émission ;
 * - soldes à recevoir = montant net − encaissé net, pour les réservations non annulées.
 */
final class DashboardQuery
{
    /** @return array<string, mixed> */
    public function summary(CarbonImmutable $today): array
    {
        $today = $today->startOfDay();
        $days = array_map(fn (int $i) => $today->subDays(6 - $i), range(0, 6));

        return [
            'date' => $today->toDateString(),
            'collected_today_fcfa' => $this->netCollected($today, $today->addDay()),
            'collected_last_7_days' => array_map(fn (CarbonImmutable $day) => [
                'date' => $day->toDateString(),
                'net_fcfa' => $this->netCollected($day, $day->addDay()),
            ], $days),
            'invoiced_month_fcfa' => $this->invoiced($today->startOfMonth(), $today->startOfMonth()->addMonth()),
            'receivables_fcfa' => $this->receivables(),
            'arrivals_today' => $this->movements('start_date', ReservationStatus::Confirmed, $today),
            'departures_today' => $this->movements('end_date', ReservationStatus::InProgress, $today),
            'recent_reservations' => $this->recent(),
        ];
    }

    private function netCollected(CarbonImmutable $from, CarbonImmutable $until): int
    {
        $paid = (int) DB::table('payments')->where('status', 'VALID')
            ->where('received_at', '>=', $from)->where('received_at', '<', $until)->sum('amount_fcfa');
        $refunded = (int) DB::table('refunds')->join('payments', 'payments.id', '=', 'refunds.payment_id')
            ->where('payments.status', 'VALID')
            ->where('refunds.processed_at', '>=', $from)->where('refunds.processed_at', '<', $until)->sum('refunds.amount_fcfa');

        return $paid - $refunded;
    }

    private function invoiced(CarbonImmutable $from, CarbonImmutable $until): int
    {
        $sum = fn (string $type) => (int) DB::table('invoices')->where('type', $type)
            ->where('issued_at', '>=', $from)->where('issued_at', '<', $until)->sum('net_fcfa');

        return $sum('INVOICE') - $sum('CREDIT_NOTE');
    }

    private function receivables(): int
    {
        $paid = DB::table('payments')->select('reservation_id', DB::raw('SUM(amount_fcfa) AS paid'))
            ->where('status', 'VALID')->groupBy('reservation_id');
        $refunded = DB::table('refunds')->join('payments', 'payments.id', '=', 'refunds.payment_id')
            ->select('payments.reservation_id', DB::raw('SUM(refunds.amount_fcfa) AS refunded'))
            ->where('payments.status', 'VALID')->groupBy('payments.reservation_id');

        $rows = DB::table('reservations')
            ->leftJoinSub($paid, 'p', 'p.reservation_id', '=', 'reservations.id')
            ->leftJoinSub($refunded, 'r', 'r.reservation_id', '=', 'reservations.id')
            ->where('reservations.status', '!=', ReservationStatus::Cancelled->value)
            ->select('reservations.net_fcfa', DB::raw('COALESCE(p.paid, 0) AS paid'), DB::raw('COALESCE(r.refunded, 0) AS refunded'))
            ->get();

        return (int) $rows->sum(fn (object $row) => max(0, (int) $row->net_fcfa - ((int) $row->paid - (int) $row->refunded)));
    }

    /** @return list<array<string, mixed>> */
    private function movements(string $dateColumn, ReservationStatus $status, CarbonImmutable $day): array
    {
        return $this->baseQuery()
            ->where('reservations.status', $status->value)
            ->whereDate("reservations.{$dateColumn}", $day->toDateString())
            ->orderBy($dateColumn === 'start_date' ? 'reservations.start_time' : 'reservations.end_time')
            ->get()
            ->map(fn (object $row) => self::row($row))
            ->values()
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function recent(): array
    {
        return $this->baseQuery()->orderByDesc('reservations.id')->limit(5)->get()
            ->map(fn (object $row) => self::row($row))->values()->all();
    }

    private function baseQuery(): Builder
    {
        return DB::table('reservations')
            ->join('customers', 'customers.id', '=', 'reservations.customer_id')
            ->join('rooms', 'rooms.id', '=', 'reservations.room_id')
            ->join('room_types', 'room_types.id', '=', 'rooms.room_type_id')
            ->select(
                'reservations.uuid', 'reservations.status', 'reservations.start_date', 'reservations.end_date',
                'reservations.start_time', 'reservations.end_time', 'reservations.net_fcfa',
                'customers.name', 'customers.first_name', 'rooms.number', 'room_types.label AS room_type',
            );
    }

    /** @return array<string, mixed> Identifiants publics uniquement (D-026). */
    private static function row(object $row): array
    {
        $status = ReservationStatus::from((string) $row->status);

        return [
            'id' => $row->uuid,
            'customer' => trim($row->name.' '.($row->first_name ?? '')),
            'room' => ['number' => $row->number, 'type' => $row->room_type],
            'start_date' => CarbonImmutable::parse((string) $row->start_date)->toDateString(),
            'end_date' => CarbonImmutable::parse((string) $row->end_date)->toDateString(),
            'start_time' => $row->start_time === null ? null : substr((string) $row->start_time, 0, 5),
            'end_time' => $row->end_time === null ? null : substr((string) $row->end_time, 0, 5),
            'status' => $status->value,
            'status_label' => $status->label(),
            'net_fcfa' => (int) $row->net_fcfa,
        ];
    }
}
