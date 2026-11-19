<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Rapport financier — JB Hôtel</title>
<style>@page { margin: 28px; } body { font: 10px DejaVu Sans, sans-serif; color: #183e35; } table { width: 100%; border-collapse: collapse; margin: 12px 0; } th, td { padding: 5px; border-bottom: 1px solid #ddd; text-align: right; } th:first-child, td:first-child { text-align: left; } thead { display: table-header-group; } tr { page-break-inside: avoid; } p { line-height: 1.6; }</style></head>
<body><h1>JB Hôtel — Rapport financier</h1><p>Du {{ $report['from'] }} au {{ $report['to'] }} · Généré le {{ $report['generated_at'] }}</p>
<p>@foreach($report['filters'] as $label=>$value) {{ $label }} : {{ $value }} · @endforeach</p>
<table><thead><tr><th>Indicateur</th><th>FCFA / nombre</th></tr></thead><tbody>
@foreach(['collected_fcfa'=>'Encaissé', 'refunded_fcfa'=>'Remboursé', 'net_collected_fcfa'=>'Encaissé net', 'invoices_fcfa'=>'Factures', 'credit_notes_fcfa'=>'Avoirs', 'net_invoiced_fcfa'=>'Facturé net', 'discount_fcfa'=>'Remises des séjours', 'stays_count'=>'Séjours', 'booked_fcfa'=>'Montant réservé'] as $key=>$label)
<tr><td>{{ $label }}</td><td>{{ number_format($report['totals'][$key], 0, ',', ' ') }}</td></tr>@endforeach
</tbody></table><h2>Ventilation par catégorie</h2><table><thead><tr><th>Catégorie</th><th>Encaissé</th><th>Remboursé</th><th>Net</th></tr></thead><tbody>@foreach($report['by_type'] as $row)<tr><td>{{ $row['label'] }}</td><td>{{ number_format($row['collected_fcfa'],0,',',' ') }}</td><td>{{ number_format($row['refunded_fcfa'],0,',',' ') }}</td><td>{{ number_format($row['net_fcfa'],0,',',' ') }}</td></tr>@endforeach</tbody></table>
<p>Soldes actuels des séjours sélectionnés : {{ number_format($report['totals']['receivables_fcfa'],0,',',' ') }} FCFA. Occupation au {{ $report['occupancy']['at'] }} : {{ $report['occupancy']['occupied'] }} occupée(s), {{ $report['occupancy']['free'] }} libre(s), {{ $report['occupancy']['reserved'] }} réservée(s), {{ $report['occupancy']['maintenance'] }} en maintenance.</p>
<h2>Mouvements par jour</h2><table><thead><tr><th>Date</th><th>Encaissé</th><th>Remboursé</th><th>Net</th></tr></thead><tbody>@foreach($report['daily'] as $row)<tr><td>{{ $row['date'] }}</td><td>{{ number_format($row['collected_fcfa'],0,',',' ') }}</td><td>{{ number_format($row['refunded_fcfa'],0,',',' ') }}</td><td>{{ number_format($row['net_fcfa'],0,',',' ') }}</td></tr>@endforeach</tbody></table>
<p>Écart de rapprochement : {{ $report['reconciliation']['difference_fcfa'] }} FCFA.</p>
@foreach($report['definitions'] as $definition)<p>{{ $definition }}</p>@endforeach
</body></html>
