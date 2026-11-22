<?php

namespace App\Shared\Export;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Chart\Chart;
use PhpOffice\PhpSpreadsheet\Chart\DataSeries;
use PhpOffice\PhpSpreadsheet\Chart\DataSeriesValues;
use PhpOffice\PhpSpreadsheet\Chart\Layout;
use PhpOffice\PhpSpreadsheet\Chart\Legend;
use PhpOffice\PhpSpreadsheet\Chart\PlotArea;
use PhpOffice\PhpSpreadsheet\Chart\Title;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Classeur Excel aux couleurs de JB Hôtel (exports .xlsx, demande de l'utilisateur du 22/11/2026) :
 * une feuille « Tableau de bord » (bandeau, indicateurs en tuiles, tableaux de synthèse et vrais
 * graphiques Excel), puis une feuille par jeu de données (en-tête vert, lignes alternées, formats
 * FCFA et dates, filtres, en-tête figé, impression paysage à la largeur de la page).
 */
final class Workbook
{
    public const PRIMARY = '047857';

    public const DARK = '12352D';

    public const GOLD = 'E8C48B';

    public const MINT = 'E8F4EE';

    public const ZEBRA = 'F5F8F6';

    public const LINE = 'DCE7E1';

    public const MUTED = '4F635C';

    /** Couleurs des graphiques (ordre fixe). */
    private const SERIES = ['2A78D6', '047857', 'EB6834', 'EDA100', '6250D6', 'C93644', '1BAF7A', '94A39B'];

    public const FCFA = '#,##0" FCFA"';

    public const INTEGER = '#,##0';

    public const DATE = 'dd/mm/yyyy';

    public const DATETIME = 'dd/mm/yyyy hh:mm';

    public const PERCENT = '0.0%';

    private readonly Spreadsheet $book;

    private readonly Worksheet $dashboard;

    /** Prochaine ligne libre de la feuille « Tableau de bord ». */
    private int $row = 5;

    private int $charts = 0;

    /**
     * @param  string  $title  « Réservations », « Caisse »…
     * @param  list<string>  $context  Filtres appliqués, période, auteur de l'export.
     */
    public function __construct(private readonly string $title, private readonly array $context = [])
    {
        $this->book = new Spreadsheet;
        $this->book->getProperties()
            ->setCreator('JB Hôtel')
            ->setTitle("JB Hôtel — {$title}")
            ->setCompany('JB Hôtel');
        $this->book->getDefaultStyle()->getFont()->setName('Calibri')->setSize(11);
        $this->dashboard = $this->book->getActiveSheet();
        $this->dashboard->setTitle('Tableau de bord');
        $this->dashboard->setShowGridlines(false);
        foreach (range(1, 14) as $column) {
            $this->dashboard->getColumnDimensionByColumn($column)->setWidth($column === 1 ? 3 : 15);
        }
        $this->band($this->dashboard, 1, 14, "JB Hôtel — {$title}", 'Tableau de bord');
        $this->setupPrint($this->dashboard, 'B1:M60');
    }

    /**
     * Indicateurs en tuiles (4 par ligne) : libellé, valeur, explication.
     *
     * @param  list<array{label: string, value: int|float|string|null, format?: string, hint?: string, tone?: string}>  $kpis
     */
    public function kpis(array $kpis): self
    {
        foreach (array_chunk($kpis, 4) as $line) {
            foreach ($line as $index => $kpi) {
                $first = 2 + $index * 3;
                $last = $first + 2;
                $range = fn (int $row) => self::cell($first, $row).':'.self::cell($last, $row);
                $sheet = $this->dashboard;
                foreach ([0, 1, 2] as $offset) {
                    $sheet->mergeCells($range($this->row + $offset));
                }
                self::text($sheet, self::cell($first, $this->row), mb_strtoupper($kpi['label']));
                $value = $kpi['value'];
                if (is_int($value) || is_float($value)) {
                    $sheet->setCellValue(self::cell($first, $this->row + 1), $value);
                } else {
                    self::text($sheet, self::cell($first, $this->row + 1), $value ?? '—');
                }
                if (isset($kpi['format']) && (is_int($value) || is_float($value))) {
                    $sheet->getStyle(self::cell($first, $this->row + 1))->getNumberFormat()->setFormatCode($kpi['format']);
                }
                self::text($sheet, self::cell($first, $this->row + 2), $kpi['hint'] ?? '');
                $block = self::cell($first, $this->row).':'.self::cell($last, $this->row + 2);
                $sheet->getStyle($block)->applyFromArray([
                    'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => self::MINT]],
                    'borders' => [
                        'outline' => ['borderStyle' => Border::BORDER_THIN, 'color' => ['rgb' => self::LINE]],
                        'left' => ['borderStyle' => Border::BORDER_THICK, 'color' => ['rgb' => $kpi['tone'] ?? self::PRIMARY]],
                    ],
                    'alignment' => ['horizontal' => Alignment::HORIZONTAL_LEFT, 'indent' => 1, 'vertical' => Alignment::VERTICAL_CENTER],
                ]);
                $sheet->getStyle(self::cell($first, $this->row))->getFont()->setSize(9)->setBold(true)->getColor()->setRGB(self::MUTED);
                $sheet->getStyle(self::cell($first, $this->row + 1))->getFont()->setSize(18)->setBold(true)->getColor()->setRGB(self::DARK);
                $sheet->getStyle(self::cell($first, $this->row + 2))->getFont()->setSize(9)->setItalic(true)->getColor()->setRGB(self::MUTED);
            }
            $this->dashboard->getRowDimension($this->row)->setRowHeight(18);
            $this->dashboard->getRowDimension($this->row + 1)->setRowHeight(30);
            $this->dashboard->getRowDimension($this->row + 2)->setRowHeight(18);
            $this->row += 4;
        }

        return $this;
    }

    /**
     * Tableau de synthèse sur la feuille « Tableau de bord » et son graphique Excel à côté.
     *
     * @param  list<array{0: string, 1: int|float}>  $rows  libellé, valeur
     * @param  'bar'|'pie'|'column'  $chart
     */
    public function summary(string $heading, string $valueLabel, array $rows, string $chart = 'bar', ?string $format = null): self
    {
        $sheet = $this->dashboard;
        $top = $this->row;
        $sheet->mergeCells("B{$top}:E{$top}");
        self::text($sheet, "B{$top}", $heading);
        $sheet->getStyle("B{$top}")->getFont()->setBold(true)->setSize(12)->getColor()->setRGB(self::DARK);
        $header = $top + 1;
        $sheet->mergeCells("B{$header}:C{$header}");
        $sheet->mergeCells("D{$header}:E{$header}");
        $sheet->setCellValue("B{$header}", 'Libellé');
        $sheet->setCellValue("D{$header}", $valueLabel);
        $this->headerStyle($sheet, "B{$header}:E{$header}");
        $line = $header;
        foreach ($rows as $index => [$label, $value]) {
            $line = $header + 1 + $index;
            $sheet->mergeCells("B{$line}:C{$line}");
            $sheet->mergeCells("D{$line}:E{$line}");
            self::text($sheet, "B{$line}", $label);
            $sheet->setCellValue("D{$line}", $value);
            $sheet->getStyle("D{$line}")->getNumberFormat()->setFormatCode($format ?? self::INTEGER);
            if ($index % 2 === 1) {
                $sheet->getStyle("B{$line}:E{$line}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB(self::ZEBRA);
            }
        }
        if ($rows === []) {
            $line = $header + 1;
            $sheet->mergeCells("B{$line}:E{$line}");
            $sheet->setCellValue("B{$line}", 'Aucune donnée sur la période.');
            $sheet->getStyle("B{$line}")->getFont()->setItalic(true)->getColor()->setRGB(self::MUTED);
        }
        $sheet->getStyle("B{$header}:E{$line}")->getBorders()->getOutline()->setBorderStyle(Border::BORDER_THIN)->getColor()->setRGB(self::LINE);

        if ($rows !== []) {
            $this->chart($sheet, $heading, $header + 1, $line, $chart, $top);
        }
        // Le graphique occupe environ 16 lignes à droite du tableau.
        $this->row = max($line, $top + 16) + 2;

        return $this;
    }

    /** Note sous les tableaux (définitions des indicateurs, limites). */
    public function note(string $text): self
    {
        $this->dashboard->mergeCells("B{$this->row}:M{$this->row}");
        self::text($this->dashboard, "B{$this->row}", $text);
        $style = $this->dashboard->getStyle("B{$this->row}");
        $style->getFont()->setItalic(true)->setSize(9)->getColor()->setRGB(self::MUTED);
        $style->getAlignment()->setWrapText(true);
        $this->dashboard->getRowDimension($this->row)->setRowHeight(30);
        $this->row++;

        return $this;
    }

    /**
     * Feuille de données : une ligne par élément.
     *
     * @param  list<array{label: string, type?: 'text'|'int'|'fcfa'|'date'|'datetime'|'percent', width?: int, total?: bool, wrap?: bool}>  $columns
     * @param  iterable<array<int, mixed>>  $rows  valeurs dans l'ordre des colonnes
     */
    public function sheet(string $name, array $columns, iterable $rows, ?string $description = null): self
    {
        $sheet = $this->book->createSheet();
        $sheet->setTitle(mb_substr($name, 0, 31));
        $last = count($columns);
        $header = 4;
        // Petite respiration entre le bandeau et l'en-tête du tableau.
        $sheet->getRowDimension(3)->setRowHeight(6);
        foreach ($columns as $index => $column) {
            $col = $index + 1;
            self::text($sheet, self::cell($col, $header), $column['label']);
            $sheet->getColumnDimensionByColumn($col)->setWidth($column['width'] ?? match ($column['type'] ?? 'text') {
                'fcfa' => 19, 'date' => 12, 'datetime' => 18, 'int', 'percent' => 11, default => 22,
            });
        }
        // Le bandeau se règle sur la largeur réelle des colonnes.
        $this->band($sheet, 1, $last, $name, $description ?? $this->title);
        $this->headerStyle($sheet, self::cell(1, $header).':'.self::cell($last, $header));
        $sheet->getRowDimension($header)->setRowHeight(30);

        $line = $header;
        foreach ($rows as $values) {
            $line++;
            foreach ($columns as $index => $column) {
                $type = $column['type'] ?? 'text';
                $value = self::value($values[$index] ?? null, $type);
                $cell = self::cell($index + 1, $line);
                // Texte gardé tel quel : téléphone, numéro de chambre « 001 », référence ; jamais
                // une formule, même si la saisie commence par « = ».
                if ($value !== null && ($type === 'text' || ! (is_int($value) || is_float($value)))) {
                    self::text($sheet, $cell, (string) $value);
                } else {
                    $sheet->setCellValue($cell, $value);
                }
            }
        }
        $first = $header + 1;
        if ($line < $first) {
            $sheet->mergeCells(self::cell(1, $first).':'.self::cell($last, $first));
            $sheet->setCellValue(self::cell(1, $first), 'Aucune donnée pour ces filtres.');
            $sheet->getStyle(self::cell(1, $first))->getFont()->setItalic(true)->getColor()->setRGB(self::MUTED);
            $line = $first;
        } else {
            foreach ($columns as $index => $column) {
                $format = match ($column['type'] ?? 'text') {
                    'fcfa' => self::FCFA, 'int' => self::INTEGER, 'date' => self::DATE,
                    'datetime' => self::DATETIME, 'percent' => self::PERCENT, default => null,
                };
                $range = self::cell($index + 1, $first).':'.self::cell($index + 1, $line);
                if ($format !== null) {
                    $sheet->getStyle($range)->getNumberFormat()->setFormatCode($format);
                    $sheet->getStyle($range)->getAlignment()->setHorizontal(Alignment::HORIZONTAL_RIGHT);
                }
                // Textes longs (définitions, états du journal) : renvoi à la ligne dans la colonne.
                if ($column['wrap'] ?? false) {
                    $sheet->getStyle($range)->getAlignment()->setWrapText(true);
                }
            }
            $sheet->getStyle(self::cell(1, $first).':'.self::cell($last, $line))->getAlignment()->setVertical(Alignment::VERTICAL_TOP);
            for ($r = $first; $r <= $line; $r += 2) {
                $sheet->getStyle(self::cell(1, $r).':'.self::cell($last, $r))
                    ->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB(self::ZEBRA);
            }
            $sheet->setAutoFilter(self::cell(1, $header).':'.self::cell($last, $line));
            // Ligne de total des montants (formule SOUS.TOTAL : suit les filtres), seulement s'il y en a.
            $summed = array_filter($columns, fn (array $column) => in_array($column['type'] ?? 'text', ['fcfa', 'int'], true) && ($column['total'] ?? true));
            if ($summed !== []) {
                $totals = $line + 1;
                $sheet->setCellValue(self::cell(1, $totals), 'Total');
                foreach ($summed as $index => $column) {
                    $letter = Coordinate::stringFromColumnIndex($index + 1);
                    $sheet->setCellValue(self::cell($index + 1, $totals), "=SUBTOTAL(109,{$letter}{$first}:{$letter}{$line})");
                    $sheet->getStyle(self::cell($index + 1, $totals))->getNumberFormat()
                        ->setFormatCode($column['type'] === 'fcfa' ? self::FCFA : self::INTEGER);
                }
                $sheet->getStyle(self::cell(1, $totals).':'.self::cell($last, $totals))->applyFromArray([
                    'font' => ['bold' => true, 'color' => ['rgb' => self::DARK]],
                    'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => self::MINT]],
                    'borders' => ['top' => ['borderStyle' => Border::BORDER_MEDIUM, 'color' => ['rgb' => self::PRIMARY]]],
                ]);
                $line = $totals;
            }
        }
        $sheet->getStyle(self::cell(1, $header).':'.self::cell($last, $line))->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_HAIR)->getColor()->setRGB(self::LINE);
        $sheet->freezePane(self::cell(1, $header + 1));
        $this->setupPrint($sheet, 'A1:'.self::cell($last, $line));
        $sheet->getPageSetup()->setRowsToRepeatAtTopByStartAndEnd($header, $header);

        return $this;
    }

    public function download(string $filename): StreamedResponse
    {
        $this->book->setActiveSheetIndex(0);
        $writer = new Xlsx($this->book);
        $writer->setIncludeCharts(true);

        return new StreamedResponse(function () use ($writer): void {
            $writer->save('php://output');
        }, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            'Cache-Control' => 'no-store',
        ]);
    }

    /** Pour les essais : le classeur construit. */
    public function spreadsheet(): Spreadsheet
    {
        $this->book->setActiveSheetIndex(0);

        return $this->book;
    }

    /** Nom de fichier : jb-hotel-<module>-<AAAA-MM-JJ-HHMM>.xlsx */
    public static function filename(string $module, ?CarbonInterface $at = null): string
    {
        return 'jb-hotel-'.$module.'-'.($at ?? now())->format('Y-m-d-Hi').'.xlsx';
    }

    /**
     * Regroupement libellé → somme (ou nombre), du plus grand au plus petit.
     *
     * @template T
     *
     * @param  iterable<T>  $items
     * @param  callable(T): string  $key
     * @param  (callable(T): (int|float))|null  $value
     * @return list<array{0: string, 1: int|float}>
     */
    public static function group(iterable $items, callable $key, ?callable $value = null): array
    {
        $groups = [];
        foreach ($items as $item) {
            $label = $key($item);
            $groups[$label] = ($groups[$label] ?? 0) + ($value === null ? 1 : $value($item));
        }
        arsort($groups);

        return array_map(fn ($label, $total) => [(string) $label, $total], array_keys($groups), array_values($groups));
    }

    /**
     * Regroupement par mois, dans l'ordre du calendrier : « déc. 2026 » → somme (ou nombre).
     *
     * @template T
     *
     * @param  iterable<T>  $items
     * @param  callable(T): ?string  $date  date ISO (seuls l'année et le mois comptent)
     * @param  (callable(T): (int|float))|null  $value
     * @return list<array{0: string, 1: int|float}>
     */
    public static function monthly(iterable $items, callable $date, ?callable $value = null): array
    {
        $groups = [];
        foreach ($items as $item) {
            $iso = $date($item);
            if ($iso === null || $iso === '') {
                continue;
            }
            $month = CarbonImmutable::parse($iso)->setTimezone((string) config('app.timezone'))->format('Y-m');
            $groups[$month] = ($groups[$month] ?? 0) + ($value === null ? 1 : $value($item));
        }
        ksort($groups);

        return array_map(fn ($month, $total) => [self::monthLabel((string) $month), $total], array_keys($groups), array_values($groups));
    }

    /** « 2026-12 » → « déc. 2026 ». */
    public static function monthLabel(string $value): string
    {
        $names = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        [$year, $month] = array_pad(explode('-', $value), 2, '01');

        return ($names[(int) $month - 1] ?? $month).' '.$year;
    }

    private function band(Worksheet $sheet, int $from, int $to, string $title, string $subtitle): void
    {
        $range = fn (int $row) => self::cell($from, $row).':'.self::cell($to, $row);
        $sheet->mergeCells($range(1));
        $sheet->mergeCells($range(2));
        self::text($sheet, self::cell($from, 1), $title);
        $context = $this->context === [] ? '' : ' · '.implode(' · ', $this->context);
        self::text($sheet, self::cell($from, 2), $subtitle.$context);
        $sheet->getStyle($range(1))->applyFromArray([
            'font' => ['bold' => true, 'size' => 18, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => self::DARK]],
            'alignment' => ['vertical' => Alignment::VERTICAL_CENTER, 'indent' => 1],
        ]);
        $sheet->getStyle($range(2))->applyFromArray([
            'font' => ['size' => 10, 'color' => ['rgb' => self::DARK]],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => self::GOLD]],
            'alignment' => ['vertical' => Alignment::VERTICAL_CENTER, 'indent' => 1, 'wrapText' => true],
        ]);
        $sheet->getRowDimension(1)->setRowHeight(34);
        // Hauteur de la ligne dorée selon la longueur du texte et la largeur du bandeau.
        $width = 0.0;
        for ($column = $from; $column <= $to; $column++) {
            $width += max(8.0, $sheet->getColumnDimensionByColumn($column)->getWidth());
        }
        $lines = max(1, (int) ceil(mb_strlen($subtitle.$context) * 1.05 / max(20.0, $width)));
        $sheet->getRowDimension(2)->setRowHeight(max(22, 14 * $lines + 8));
    }

    private function headerStyle(Worksheet $sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => self::PRIMARY]],
            'alignment' => ['vertical' => Alignment::VERTICAL_CENTER, 'wrapText' => true, 'indent' => 1],
        ]);
    }

    /** @param  'bar'|'pie'|'column'  $type */
    private function chart(Worksheet $sheet, string $title, int $first, int $last, string $type, int $top): void
    {
        $name = "'".str_replace("'", "''", $sheet->getTitle())."'";
        $labels = [new DataSeriesValues(DataSeriesValues::DATASERIES_TYPE_STRING, "{$name}!\$B\${$first}:\$B\${$last}", null, $last - $first + 1)];
        $values = [new DataSeriesValues(DataSeriesValues::DATASERIES_TYPE_NUMBER, "{$name}!\$D\${$first}:\$D\${$last}", null, $last - $first + 1)];
        $values[0]->setFillColor(array_slice(self::SERIES, 0, max(1, $last - $first + 1)));
        $series = new DataSeries(
            $type === 'pie' ? DataSeries::TYPE_DONUTCHART : DataSeries::TYPE_BARCHART,
            $type === 'pie' ? null : DataSeries::GROUPING_CLUSTERED,
            [0],
            [],
            $labels,
            $values,
        );
        if ($type !== 'pie') {
            $series->setPlotDirection($type === 'column' ? DataSeries::DIRECTION_COL : DataSeries::DIRECTION_BAR);
        }
        $layout = new Layout;
        $layout->setShowVal(true);
        if ($type === 'pie') {
            $layout->setShowPercent(true);
        }
        $chart = new Chart(
            'chart'.(++$this->charts),
            new Title($title),
            $type === 'pie' ? new Legend(Legend::POSITION_RIGHT, null, false) : null,
            new PlotArea($layout, [$series]),
        );
        $chart->setTopLeftPosition("G{$top}");
        $chart->setBottomRightPosition('N'.($top + 15));
        $sheet->addChart($chart);
    }

    private function setupPrint(Worksheet $sheet, string $area): void
    {
        $setup = $sheet->getPageSetup();
        $setup->setOrientation(PageSetup::ORIENTATION_LANDSCAPE);
        $setup->setPaperSize(PageSetup::PAPERSIZE_A4);
        $setup->setFitToWidth(1);
        $setup->setFitToHeight(0);
        $setup->setPrintArea($area);
        $sheet->getHeaderFooter()->setOddFooter('&L&8JB Hôtel — '.$this->title.'&R&8Page &P / &N');
        $sheet->getPageMargins()->setLeft(0.4)->setRight(0.4)->setTop(0.5)->setBottom(0.6);
    }

    private static function value(mixed $value, string $type): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (in_array($type, ['date', 'datetime'], true)) {
            try {
                $date = $value instanceof CarbonInterface ? $value : CarbonImmutable::parse((string) $value);

                return ExcelDate::PHPToExcel($date->setTimezone((string) config('app.timezone'))->format($type === 'date' ? 'Y-m-d' : 'Y-m-d H:i:s'));
            } catch (\Throwable) {
                return (string) $value;
            }
        }

        return $value;
    }

    /** Texte écrit comme texte : une saisie qui commence par « = » ne devient jamais une formule. */
    private static function text(Worksheet $sheet, string $cell, string $value): void
    {
        $sheet->setCellValueExplicit($cell, $value, DataType::TYPE_STRING);
    }

    private static function cell(int $column, int $row): string
    {
        return Coordinate::stringFromColumnIndex($column).$row;
    }
}
