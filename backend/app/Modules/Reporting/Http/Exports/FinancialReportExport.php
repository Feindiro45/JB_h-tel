<?php

namespace App\Modules\Reporting\Http\Exports;

use App\Modules\Reporting\Application\Queries\ReceivablesQuery;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Rapport financier en classeur Excel : tableau de bord (les trois montants distincts — facturé,
 * encaissé, montant des séjours —, occupation, ventilations) et feuilles de détail, avec les
 * définitions de chaque indicateur.
 */
final class FinancialReportExport
{
    public const MODULE = 'rapport';

    public function __construct(private readonly ReceivablesQuery $receivables) {}

    /** @param  array<string, mixed>  $report  `FinancialReport::summary()` */
    public function build(array $report, ?Authenticatable $user): Workbook
    {
        $receivables = $this->receivables->rows();
        /** @var array<string, int> $t */
        $t = $report['totals'];
        /** @var array<string, string|null> $filters */
        $filters = $report['filters'];
        $from = CarbonImmutable::parse((string) $report['from']);
        $to = CarbonImmutable::parse((string) $report['to']);
        $book = new Workbook('Rapport financier', ExportContext::of($user, [
            'Période' => 'du '.$from->format('d/m/Y').' au '.$to->format('d/m/Y'),
        ] + array_map(fn ($value) => $value === null ? null : (string) $value, $filters)));

        $book->kpis([
            ['label' => 'Encaissé net', 'value' => $t['net_collected_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Encaissé − remboursé'],
            ['label' => 'Net facturé', 'value' => $t['net_invoiced_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Factures − avoirs', 'tone' => '2A78D6'],
            ['label' => 'Montant des séjours', 'value' => $t['booked_fcfa'], 'format' => Workbook::FCFA, 'hint' => "{$t['stays_count']} séjour(s) commençant sur la période", 'tone' => Workbook::GOLD],
            ['label' => 'Soldes à encaisser', 'value' => $t['receivables_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Restant dû aujourd’hui', 'tone' => 'C93644'],
            ['label' => 'Encaissé', 'value' => $t['collected_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Versements valides'],
            ['label' => 'Remboursé', 'value' => $t['refunded_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Par date de traitement', 'tone' => 'C93644'],
            ['label' => 'Avoirs', 'value' => $t['credit_notes_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Déduits du facturé', 'tone' => 'EDA100'],
            ['label' => 'Remises', 'value' => $t['discount_fcfa'], 'format' => Workbook::FCFA, 'hint' => 'Sur les séjours de la période', 'tone' => 'EDA100'],
        ]);

        /** @var array<string, int|string|array<string, int>> $occupancy */
        $occupancy = $report['occupancy'];
        $book->summary('Occupation des chambres maintenant', 'Chambres', array_values(array_filter([
            ['Occupées', (int) ($occupancy['occupied'] ?? 0)],
            ['Réservées', (int) ($occupancy['reserved'] ?? 0)],
            ['Libres', (int) ($occupancy['free'] ?? 0)],
            ['En maintenance', (int) ($occupancy['maintenance'] ?? 0)],
        ], fn (array $row) => $row[1] > 0)), 'pie');
        // D-072 : salles de conférence à part, seulement si l'hôtel en a.
        /** @var array<string, int> $halls */
        $halls = is_array($occupancy['conference'] ?? null) ? $occupancy['conference'] : [];
        if (array_sum($halls) > 0) {
            $book->summary('Salles de conférence maintenant', 'Salles', array_values(array_filter([
                ['Occupées', (int) ($halls['occupied'] ?? 0)],
                ['Réservées', (int) ($halls['reserved'] ?? 0)],
                ['Libres', (int) ($halls['free'] ?? 0)],
                ['En maintenance', (int) ($halls['maintenance'] ?? 0)],
            ], fn (array $row) => $row[1] > 0)), 'pie');
        }
        /** @var list<array{label: string, collected_fcfa: int, refunded_fcfa: int, net_fcfa: int}> $byType */
        $byType = $report['by_type'];
        $book->summary('Encaissé net par catégorie', 'Net', array_map(fn (array $row) => [$row['label'], $row['net_fcfa']], $byType), 'bar', Workbook::FCFA);
        /** @var list<array{date: string, collected_fcfa: int, refunded_fcfa: int, net_fcfa: int}> $daily */
        $daily = $report['daily'];
        // Au-delà d'un mois, la synthèse passe au mois (le détail quotidien reste dans « Par jour »).
        if (count($daily) > 31) {
            $book->summary('Encaissé net par mois', 'Net', Workbook::monthly($daily, fn (array $row) => $row['date'], fn (array $row) => $row['net_fcfa']), 'column', Workbook::FCFA);
        } else {
            $book->summary('Encaissé net par jour', 'Net', array_map(fn (array $row) => [CarbonImmutable::parse($row['date'])->format('d/m'), $row['net_fcfa']], $daily), 'column', Workbook::FCFA);
        }
        $book->note('Trois montants distincts : le net facturé (documents émis), l’encaissé (argent reçu) et le montant des séjours (réservé, qui n’est pas un chiffre d’affaires comptable). Voir la feuille « Définitions ».');

        $book->sheet('Par jour', [
            ['label' => 'Jour', 'type' => 'date'],
            ['label' => 'Encaissé', 'type' => 'fcfa'],
            ['label' => 'Remboursé', 'type' => 'fcfa'],
            ['label' => 'Net', 'type' => 'fcfa'],
        ], array_map(fn (array $row) => [$row['date'], $row['collected_fcfa'], $row['refunded_fcfa'], $row['net_fcfa']], $daily), 'Encaissements de chaque jour de la période');

        $book->sheet('Par catégorie', [
            ['label' => 'Catégorie', 'width' => 22],
            ['label' => 'Encaissé', 'type' => 'fcfa'],
            ['label' => 'Remboursé', 'type' => 'fcfa'],
            ['label' => 'Net', 'type' => 'fcfa'],
        ], array_map(fn (array $row) => [$row['label'], $row['collected_fcfa'], $row['refunded_fcfa'], $row['net_fcfa']], $byType), 'Encaissements par catégorie de chambre');

        $book->sheet('Soldes à encaisser', [
            ['label' => 'Client', 'width' => 26],
            ['label' => 'Téléphone', 'width' => 16],
            ['label' => 'Chambre', 'width' => 10],
            ['label' => 'Arrivée', 'type' => 'date'],
            ['label' => 'Départ', 'type' => 'date'],
            ['label' => 'Statut', 'width' => 14],
            ['label' => 'Net du séjour', 'type' => 'fcfa'],
            ['label' => 'Déjà réglé', 'type' => 'fcfa'],
            ['label' => 'Reste dû', 'type' => 'fcfa'],
        ], array_map(fn (array $row) => [
            $row['customer'],
            $row['phone'] ?? null,
            $row['room']['number'] ?? null,
            $row['start_date'],
            $row['end_date'],
            $row['status_label'],
            (int) $row['net_fcfa'],
            (int) $row['paid_net_fcfa'],
            (int) $row['balance_fcfa'],
        ], $receivables), 'Tous les séjours avec un reste dû aujourd’hui, sans les filtres ni la période du rapport');

        $labels = [
            'collected_fcfa' => 'Encaissé', 'refunded_fcfa' => 'Remboursé', 'net_collected_fcfa' => 'Encaissé net',
            'invoices_fcfa' => 'Factures', 'credit_notes_fcfa' => 'Avoirs', 'net_invoiced_fcfa' => 'Net facturé',
            'discount_fcfa' => 'Remises', 'booked_fcfa' => 'Montant des séjours', 'receivables_fcfa' => 'Soldes à encaisser',
        ];
        /** @var list<string> $definitions */
        $definitions = $report['definitions'];
        $book->sheet('Définitions', [
            ['label' => 'Indicateur', 'width' => 24],
            ['label' => 'Montant', 'type' => 'fcfa', 'total' => false],
            ['label' => 'Définition', 'width' => 90, 'wrap' => true],
        ], [
            ...array_map(fn (string $key, string $label) => [$label, $t[$key] ?? 0, null], array_keys($labels), $labels),
            ['Séjours', null, (string) $t['stays_count'].' séjour(s) confirmés, en cours ou terminés commençant sur la période'],
            ...array_map(fn (string $text) => ['Règle', null, $text], $definitions),
        ], 'Chaque indicateur, sa valeur et sa définition');

        return $book;
    }
}
