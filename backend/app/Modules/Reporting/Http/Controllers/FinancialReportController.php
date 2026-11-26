<?php

namespace App\Modules\Reporting\Http\Controllers;

use App\Modules\Reporting\Application\Queries\FinancialReport;
use App\Modules\Reporting\Http\Exports\FinancialReportExport;
use App\Shared\Export\Workbook;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

final class FinancialReportController
{
    public function __invoke(Request $request, FinancialReport $report, FinancialReportExport $workbook): Response
    {
        $values = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'], 'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'room_id' => ['nullable', 'uuid', Rule::exists('rooms', 'uuid')],
            'room_type_id' => ['nullable', 'uuid', Rule::exists('room_types', 'uuid')],
            'agent_id' => ['nullable', 'uuid', Rule::exists('users', 'uuid')],
            'format' => ['nullable', Rule::in(['csv', 'pdf', 'xlsx'])],
        ], attributes: ['from' => 'date de début', 'to' => 'date de fin', 'room_id' => 'chambre', 'room_type_id' => 'catégorie', 'agent_id' => 'agent']);
        $from = CarbonImmutable::parse($values['from'], (string) config('app.timezone'))->startOfDay();
        $until = CarbonImmutable::parse($values['to'], (string) config('app.timezone'))->startOfDay()->addDay();
        if ($from->diffInDays($until) > 366) {
            throw ValidationException::withMessages(['to' => ['Le rapport couvre au plus 366 jours.']]);
        }
        if (isset($values['format'])) {
            abort_unless($request->user()?->can('reports.export'), 403);
        }
        $filters = array_filter(array_intersect_key($values, array_flip(['room_id', 'room_type_id', 'agent_id'])), fn ($v) => $v !== null && $v !== '');
        $data = $report->summary($from, $until, $filters);
        $name = 'rapport-'.$values['from'].'-'.$values['to'];
        if (($values['format'] ?? null) === 'xlsx') {
            return $workbook->build($data, $request->user())->download(Workbook::filename(FinancialReportExport::MODULE));
        }
        if (($values['format'] ?? null) === 'pdf') {
            return Pdf::loadView('reporting.financial', ['report' => $data])->setPaper('a4')->download($name.'.pdf');
        }
        if (($values['format'] ?? null) === 'csv') {
            return response()->streamDownload(function () use ($data): void {
                $out = fopen('php://output', 'wb');
                if ($out === false) {
                    return;
                }
                fwrite($out, "\xEF\xBB\xBF");
                // Les libellés libres sont neutralisés pour éviter les formules à l'ouverture dans Excel.
                $safe = fn (mixed $value): string => preg_match('/^[\s]*[=+@-]/u', (string) $value) ? "'".(string) $value : (string) $value;
                fputcsv($out, ['Période', $data['from'], $data['to']], ';', '"', '');
                foreach ($data['filters'] as $label => $value) {
                    fputcsv($out, [$label, $safe($value)], ';', '"', '');
                }
                fputcsv($out, ['Date', 'Encaissé FCFA', 'Remboursé FCFA', 'Net FCFA'], ';', '"', '');
                foreach ($data['daily'] as $row) {
                    fputcsv($out, array_values($row), ';', '"', '');
                }
                fputcsv($out, ['Indicateur', 'Montant / nombre'], ';', '"', '');
                foreach ($data['totals'] as $key => $value) {
                    fputcsv($out, [$key, $value], ';', '"', '');
                }
                fputcsv($out, ['Catégorie', 'Encaissé FCFA', 'Remboursé FCFA', 'Net FCFA'], ';', '"', '');
                foreach ($data['by_type'] as $row) {
                    fputcsv($out, [$safe($row['label']), $row['collected_fcfa'], $row['refunded_fcfa'], $row['net_fcfa']], ';', '"', '');
                }
                foreach ($data['definitions'] as $definition) {
                    fputcsv($out, ['Définition', $safe($definition)], ';', '"', '');
                }
                fclose($out);
            }, $name.'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
        }

        return response()->json(['data' => $data]);
    }
}
