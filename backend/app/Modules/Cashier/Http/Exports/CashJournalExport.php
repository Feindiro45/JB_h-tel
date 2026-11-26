<?php

namespace App\Modules\Cashier\Http\Exports;

use App\Modules\Cashier\Application\Queries\CashJournal;
use App\Modules\Cashier\DTO\CashPeriod;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Classeur Excel de la caisse sur la période de l'écran : tableau de bord (encaissé, remboursé,
 * net, ventilations par moyen, par agent et par jour), journal des mouvements et récapitulatifs.
 * Mêmes définitions que l'écran et le tableau de bord (D-040, D-041) : le journal vient de
 * `CashJournal`, ce classeur n'en fait que le rendu.
 */
final class CashJournalExport
{
    public const MODULE = 'caisse';

    public function __construct(private readonly CashJournal $journal) {}

    public function build(CashPeriod $period, ?Authenticatable $actor): Workbook
    {
        $data = $this->journal->journal($period->from, $period->until, $period->agentId);
        /** @var array{collected_fcfa: int, refunded_fcfa: int, cancelled_fcfa: int, payments_count: int, refunds_count: int, net_fcfa: int} $totals */
        $totals = $data['totals'];
        /** @var list<array<string, mixed>> $movements */
        $movements = $data['movements'];
        /** @var list<array{label: string, collected_fcfa: int, refunded_fcfa: int}> $byMethod */
        $byMethod = $data['by_method'];
        /** @var list<array{label: string, collected_fcfa: int, refunded_fcfa: int}> $byAgent */
        $byAgent = $data['by_agent'];

        $from = $period->from;
        $last = $period->lastDay();
        $book = new Workbook('Caisse', ExportContext::of($actor, [
            'Période' => $from->equalTo($last) ? 'le '.$from->format('d/m/Y') : 'du '.$from->format('d/m/Y').' au '.$last->format('d/m/Y'),
            'Agent' => $period->agentName,
        ]));

        $book->kpis([
            ['label' => 'Encaissé', 'value' => $totals['collected_fcfa'], 'format' => Workbook::FCFA, 'hint' => "{$totals['payments_count']} versement(s) valide(s)"],
            ['label' => 'Remboursé', 'value' => $totals['refunded_fcfa'], 'format' => Workbook::FCFA, 'hint' => "{$totals['refunds_count']} remboursement(s)", 'tone' => 'C93644'],
            ['label' => 'Net de caisse', 'value' => $totals['net_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Encaissé − remboursé', 'tone' => Workbook::GOLD],
            ['label' => 'Versements annulés', 'value' => $totals['cancelled_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Listés, jamais comptés', 'tone' => 'EDA100'],
        ]);

        $net = fn (array $row) => (int) $row['collected_fcfa'] - (int) $row['refunded_fcfa'];
        $book->summary('Net par moyen de paiement', 'Net', array_map(fn (array $row) => [(string) $row['label'], $net($row)], $byMethod), 'pie', Workbook::FCFA);
        $book->summary('Net par agent', 'Net', array_map(fn (array $row) => [(string) $row['label'], $net($row)], $byAgent), 'bar', Workbook::FCFA);
        $daily = self::daily($movements);
        if (count($daily) > 31) {
            $book->summary('Net par mois', 'Net', Workbook::monthly($daily, fn (array $day) => $day['date'], fn (array $day) => $day['net']), 'column', Workbook::FCFA);
        } else {
            $book->summary('Net par jour', 'Net', array_map(fn (array $day) => [CarbonImmutable::parse($day['date'])->format('d/m'), $day['net']], $daily), 'column', Workbook::FCFA);
        }
        $book->note('Encaissé : versements valides, par date de réception. Remboursé : remboursements, par date de traitement. Un versement annulé reste listé pour la traçabilité mais n’entre dans aucun total.');

        $book->sheet('Mouvements', [
            ['label' => 'Date', 'type' => 'datetime'],
            ['label' => 'Mouvement', 'width' => 16],
            ['label' => 'Reçu', 'width' => 18],
            ['label' => 'Client', 'width' => 26],
            ['label' => 'Chambre', 'width' => 10],
            ['label' => 'Moyen', 'width' => 16],
            ['label' => 'Agent', 'width' => 20],
            ['label' => 'Statut', 'width' => 12],
            ['label' => 'Montant', 'type' => 'fcfa', 'total' => false],
            ['label' => 'Compté en caisse', 'type' => 'fcfa'],
            ['label' => 'Motif', 'width' => 28],
        ], array_map(fn (array $m) => [
            $m['at'],
            $m['type_label'],
            $m['receipt_number'],
            $m['customer']['full_name'] ?? '—',
            $m['room']['number'] ?? null,
            $m['method_label'],
            $m['agent']['name'] ?? null,
            $m['status_label'],
            (int) $m['amount_fcfa'],
            (int) $m['signed_amount_fcfa'],
            $m['reason'],
        ], $movements), 'Encaissements et remboursements, dans l’ordre chronologique');

        $book->sheet('Par jour', [
            ['label' => 'Jour', 'type' => 'date'],
            ['label' => 'Versements', 'type' => 'int'],
            ['label' => 'Encaissé', 'type' => 'fcfa'],
            ['label' => 'Remboursé', 'type' => 'fcfa'],
            ['label' => 'Net', 'type' => 'fcfa'],
        ], array_map(fn (array $day) => [$day['date'], $day['count'], $day['collected'], $day['refunded'], $day['net']], $daily), 'Récapitulatif quotidien de la caisse');

        $book->sheet('Par moyen', [
            ['label' => 'Moyen de paiement', 'width' => 22],
            ['label' => 'Encaissé', 'type' => 'fcfa'],
            ['label' => 'Remboursé', 'type' => 'fcfa'],
            ['label' => 'Net', 'type' => 'fcfa'],
        ], array_map(fn (array $row) => [$row['label'], (int) $row['collected_fcfa'], (int) $row['refunded_fcfa'], $net($row)], $byMethod), 'Ventilation par moyen de paiement');

        return $book;
    }

    /**
     * @param  list<array<string, mixed>>  $movements
     * @return list<array{date: string, count: int, collected: int, refunded: int, net: int}>
     */
    private static function daily(array $movements): array
    {
        $days = [];
        $timezone = (string) config('app.timezone');
        foreach ($movements as $m) {
            if (! $m['counted']) {
                continue;
            }
            $date = CarbonImmutable::parse((string) $m['at'])->setTimezone($timezone)->toDateString();
            $days[$date] ??= ['date' => $date, 'count' => 0, 'collected' => 0, 'refunded' => 0, 'net' => 0];
            if ($m['type'] === 'PAYMENT') {
                $days[$date]['count']++;
                $days[$date]['collected'] += (int) $m['amount_fcfa'];
            } else {
                $days[$date]['refunded'] += (int) $m['amount_fcfa'];
            }
            $days[$date]['net'] += (int) $m['signed_amount_fcfa'];
        }
        ksort($days);

        return array_values($days);
    }
}
