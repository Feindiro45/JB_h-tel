<?php

namespace App\Modules\Reporting\Application\Queries;

use App\Modules\Reservations\Domain\ReservationStatus;
use Carbon\CarbonImmutable;
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
    public function __construct(private readonly ReceivablesQuery $receivables) {}

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
            'receivables_fcfa' => $this->receivables->total(),
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

    /** @return list<array<string, mixed>> */
    private function movements(string $dateColumn, ReservationStatus $status, CarbonImmutable $day): array
    {
        return ReservationRows::query()
            ->where('reservations.status', $status->value)
            ->whereDate("reservations.{$dateColumn}", $day->toDateString())
            ->orderBy($dateColumn === 'start_date' ? 'reservations.start_time' : 'reservations.end_time')
            ->get()
            ->map(fn (object $row) => ReservationRows::row($row))
            ->values()
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function recent(): array
    {
        return ReservationRows::query()->orderByDesc('reservations.id')->limit(5)->get()
            ->map(fn (object $row) => ReservationRows::row($row))->values()->all();
    }
}
