<?php

namespace App\Modules\Reporting\Application\Queries;

use App\Modules\Reservations\Domain\ReservationStatus;
use Illuminate\Support\Facades\DB;

/**
 * Soldes à encaisser (lecture seule) : pour chaque réservation **non annulée**,
 * solde = montant net − (versements valides − remboursements). Seuls les soldes positifs sont
 * listés. Le total est celui du tableau de bord (D-040) : les deux écrans concordent toujours.
 */
final class ReceivablesQuery
{
    /** @return list<array<string, mixed>> Du séjour le plus ancien au plus récent. */
    public function rows(): array
    {
        $rows = [];
        foreach ($this->balances() as $row) {
            $paid = (int) $row->paid - (int) $row->refunded;
            $balance = (int) $row->net_fcfa - $paid;
            if ($balance > 0) {
                $rows[] = ReservationRows::row($row) + ['phone' => $row->phone, 'paid_net_fcfa' => $paid, 'balance_fcfa' => $balance];
            }
        }

        return $rows;
    }

    public function total(): int
    {
        return array_sum(array_map(fn (array $row) => $row['balance_fcfa'], $this->rows()));
    }

    /** @return iterable<object> */
    private function balances(): iterable
    {
        $paid = DB::table('payments')->select('reservation_id', DB::raw('SUM(amount_fcfa) AS paid'))
            ->where('status', 'VALID')->groupBy('reservation_id');
        $refunded = DB::table('refunds')->join('payments', 'payments.id', '=', 'refunds.payment_id')
            ->select('payments.reservation_id', DB::raw('SUM(refunds.amount_fcfa) AS refunded'))
            ->where('payments.status', 'VALID')->groupBy('payments.reservation_id');

        return ReservationRows::query()
            ->leftJoinSub($paid, 'p', 'p.reservation_id', '=', 'reservations.id')
            ->leftJoinSub($refunded, 'r', 'r.reservation_id', '=', 'reservations.id')
            ->where('reservations.status', '!=', ReservationStatus::Cancelled->value)
            ->addSelect(DB::raw('COALESCE(p.paid, 0) AS paid'), DB::raw('COALESCE(r.refunded, 0) AS refunded'))
            ->orderBy('reservations.start_date')->orderBy('reservations.id')
            ->get();
    }
}
