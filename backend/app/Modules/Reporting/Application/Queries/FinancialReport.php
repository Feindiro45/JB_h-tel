<?php

namespace App\Modules\Reporting\Application\Queries;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/** Projection financière en lecture seule. Définitions et périmètres : D-043. */
final class FinancialReport
{
    /**
     * @param  array{room_id?: string, room_type_id?: string, agent_id?: string}  $filters
     * @return array<string, mixed>
     */
    public function summary(CarbonImmutable $from, CarbonImmutable $until, array $filters): array
    {
        // Une transaction fournit une vue cohérente des agrégats et de leurs ventilations.
        return DB::transaction(function () use ($from, $until, $filters): array {
            $payments = $this->base('payments', 'p', $filters)
                ->where('p.status', 'VALID')->where('p.received_at', '>=', $from)->where('p.received_at', '<', $until)
                ->when(isset($filters['agent_id']), fn (Builder $q) => $q->where('p.cashier_id', $this->userId($filters['agent_id'])));
            $refunds = DB::table('refunds AS f')->join('payments AS p', 'p.id', '=', 'f.payment_id')
                ->join('reservations AS r', 'r.id', '=', 'p.reservation_id')
                ->join('rooms AS room', 'room.id', '=', 'r.room_id')
                ->join('room_types AS category', 'category.id', '=', 'room.room_type_id');
            $this->filterRooms($refunds, $filters);
            $refunds->where('p.status', 'VALID')->where('f.processed_at', '>=', $from)->where('f.processed_at', '<', $until)
                ->when(isset($filters['agent_id']), fn (Builder $q) => $q->where('f.processed_by', $this->userId($filters['agent_id'])));
            $invoices = $this->base('invoices', 'i', $filters)->where('i.issued_at', '>=', $from)->where('i.issued_at', '<', $until)
                ->when(isset($filters['agent_id']), fn (Builder $q) => $q->where('i.issued_by', $this->userId($filters['agent_id'])));
            $stays = DB::table('reservations AS r')->join('rooms AS room', 'room.id', '=', 'r.room_id')
                ->join('room_types AS category', 'category.id', '=', 'room.room_type_id');
            $this->filterRooms($stays, $filters);
            $stays->where('r.status', '!=', 'CANCELLED')->where('r.status', '!=', 'PENDING')
                ->where('r.start_date', '>=', $from->toDateString())->where('r.start_date', '<', $until->toDateString())
                ->when(isset($filters['agent_id']), fn (Builder $q) => $q->where('r.created_by', $this->userId($filters['agent_id'])));
            $collected = (int) (clone $payments)->sum('p.amount_fcfa');
            $refunded = (int) (clone $refunds)->sum('f.amount_fcfa');
            $billed = (int) (clone $invoices)->where('i.type', 'INVOICE')->sum('i.net_fcfa');
            $credits = (int) (clone $invoices)->where('i.type', 'CREDIT_NOTE')->sum('i.net_fcfa');
            $dailyPaid = (clone $payments)->selectRaw('DATE(p.received_at) AS day, SUM(p.amount_fcfa) AS amount')->groupByRaw('DATE(p.received_at)')->pluck('amount', 'day');
            $dailyRefunded = (clone $refunds)->selectRaw('DATE(f.processed_at) AS day, SUM(f.amount_fcfa) AS amount')->groupByRaw('DATE(f.processed_at)')->pluck('amount', 'day');
            $daily = [];
            for ($day = $from; $day->lt($until); $day = $day->addDay()) {
                $date = $day->toDateString();
                $daily[] = ['date' => $date, 'collected_fcfa' => (int) ($dailyPaid[$date] ?? 0), 'refunded_fcfa' => (int) ($dailyRefunded[$date] ?? 0), 'net_fcfa' => (int) ($dailyPaid[$date] ?? 0) - (int) ($dailyRefunded[$date] ?? 0)];
            }
            $byType = [];
            $groups = DB::table('room_types')->orderBy('id')->get(['uuid', 'label']);
            foreach ($groups as $type) {
                $paid = (int) (clone $payments)->where('category.uuid', $type->uuid)->sum('p.amount_fcfa');
                $back = (int) (clone $refunds)->where('category.uuid', $type->uuid)->sum('f.amount_fcfa');
                $byType[] = ['id' => $type->uuid, 'label' => $type->label, 'collected_fcfa' => $paid, 'refunded_fcfa' => $back, 'net_fcfa' => $paid - $back];
            }

            $paidForStay = DB::table('payments')->where('status', 'VALID')->selectRaw('reservation_id, SUM(amount_fcfa) AS paid')->groupBy('reservation_id');
            $refundedForStay = DB::table('refunds')->join('payments', 'payments.id', '=', 'refunds.payment_id')->where('payments.status', 'VALID')->selectRaw('payments.reservation_id, SUM(refunds.amount_fcfa) AS refunded')->groupBy('payments.reservation_id');
            $receivables = (int) (clone $stays)->leftJoinSub($paidForStay, 'paid_stay', 'paid_stay.reservation_id', '=', 'r.id')
                ->leftJoinSub($refundedForStay, 'refunded_stay', 'refunded_stay.reservation_id', '=', 'r.id')
                ->sum(DB::raw('GREATEST(0, r.net_fcfa - COALESCE(paid_stay.paid, 0) + COALESCE(refunded_stay.refunded, 0))'));

            return [
                'from' => $from->toDateString(), 'to' => $until->subDay()->toDateString(), 'generated_at' => CarbonImmutable::now()->toIso8601String(),
                'filters' => [
                    'Chambre' => isset($filters['room_id']) ? DB::table('rooms')->where('uuid', $filters['room_id'])->value('number') : 'Toutes',
                    'Catégorie' => isset($filters['room_type_id']) ? DB::table('room_types')->where('uuid', $filters['room_type_id'])->value('label') : 'Toutes',
                    'Agent' => isset($filters['agent_id']) ? DB::table('users')->where('uuid', $filters['agent_id'])->value('name') : 'Tous',
                ],
                'totals' => ['collected_fcfa' => $collected, 'refunded_fcfa' => $refunded, 'net_collected_fcfa' => $collected - $refunded,
                    'invoices_fcfa' => $billed, 'credit_notes_fcfa' => $credits, 'net_invoiced_fcfa' => $billed - $credits,
                    'discount_fcfa' => (int) (clone $stays)->sum('r.discount_fcfa'), 'stays_count' => (clone $stays)->count(),
                    'booked_fcfa' => (int) (clone $stays)->sum('r.net_fcfa'), 'receivables_fcfa' => $receivables],
                'occupancy' => $this->occupancy($filters),
                'daily' => $daily, 'by_type' => $byType,
                'reconciliation' => ['daily_net_fcfa' => array_sum(array_column($daily, 'net_fcfa')), 'type_net_fcfa' => array_sum(array_column($byType, 'net_fcfa')), 'difference_fcfa' => $collected - $refunded - array_sum(array_column($daily, 'net_fcfa'))],
                'definitions' => [
                    'Encaissements : versements valides, par date de réception ; remboursements par date de traitement et agent ayant effectué chaque mouvement. Les annulations sont exclues.',
                    'Facturé net : factures moins avoirs par date d’émission et émetteur, y compris les factures ensuite créditées pour éviter de déduire deux fois l’avoir.',
                    'Séjours et remises : réservations confirmées, en cours ou terminées dont la date de début appartient à la période, par auteur de réservation. Ce montant réservé ne constitue pas un chiffre d’affaires comptable.',
                    'Les filtres chambre et catégorie portent sur le catalogue actuel. Les montants des factures restent ceux de leurs instantanés figés. Les séries et les ventilations se rapprochent de l’encaissé net.',
                    'Soldes actuels des séjours sélectionnés : net réservé moins tous les encaissements nets du séjour, même hors période. L’occupation est un instantané au moment de la consultation, filtré par chambre et catégorie, tous agents confondus.',
                ],
            ];
        });
    }

    /**
     * Chambres seulement ; les salles de conférence sont comptées à part dans `conference`
     * (D-072, choix de l'utilisateur).
     *
     * @param  array{room_id?: string, room_type_id?: string, agent_id?: string}  $filters
     * @return array<string, int|string|array<string, int>>
     */
    private function occupancy(array $filters): array
    {
        $at = CarbonImmutable::now();
        $rooms = DB::table('rooms AS room')->join('room_types AS category', 'category.id', '=', 'room.room_type_id');
        $this->filterRooms($rooms, $filters);
        $catalog = $rooms->get(['room.id', 'room.maintenance_status', 'category.kind']);
        $current = DB::table('reservations')->whereIn('room_id', $catalog->pluck('id'))
            ->whereIn('status', ['PENDING', 'CONFIRMED', 'IN_PROGRESS'])
            ->where(fn (Builder $q) => $q->where('status', 'IN_PROGRESS')->orWhere(fn (Builder $w) => $w->where('blocked_from', '<=', $at)->where('blocked_until', '>', $at)))
            ->get(['room_id', 'status'])->groupBy('room_id');
        $empty = ['occupied' => 0, 'reserved' => 0, 'maintenance' => 0, 'free' => 0];
        $counts = ['ROOM' => $empty, 'CONFERENCE' => $empty];
        foreach ($catalog as $room) {
            $stays = $current->get($room->id, collect());
            $state = $stays->contains('status', 'IN_PROGRESS') ? 'occupied' : ($room->maintenance_status === 'MAINTENANCE' ? 'maintenance' : ($stays->isEmpty() ? 'free' : 'reserved'));
            $counts[$room->kind === 'CONFERENCE' ? 'CONFERENCE' : 'ROOM'][$state]++;
        }

        return ['at' => $at->toIso8601String()] + $counts['ROOM'] + ['conference' => $counts['CONFERENCE']];
    }

    /** @param array{room_id?: string, room_type_id?: string, agent_id?: string} $filters */
    private function base(string $table, string $alias, array $filters): Builder
    {
        $query = DB::table($table.' AS '.$alias)->join('reservations AS r', 'r.id', '=', $alias.'.reservation_id')
            ->join('rooms AS room', 'room.id', '=', 'r.room_id')->join('room_types AS category', 'category.id', '=', 'room.room_type_id');
        $this->filterRooms($query, $filters);

        return $query;
    }

    /** @param array{room_id?: string, room_type_id?: string, agent_id?: string} $filters */
    private function filterRooms(Builder $query, array $filters): void
    {
        $query->when(isset($filters['room_id']), fn (Builder $q) => $q->where('room.uuid', $filters['room_id']))
            ->when(isset($filters['room_type_id']), fn (Builder $q) => $q->where('category.uuid', $filters['room_type_id']));
    }

    private function userId(string $uuid): int
    {
        return (int) DB::table('users')->where('uuid', $uuid)->value('id');
    }
}
