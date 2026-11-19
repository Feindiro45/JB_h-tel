@php
    use App\Shared\Support\Format;
    use Carbon\CarbonImmutable;

    /** @var array<string, mixed> $doc  Instantané figé de la facture ou de l'avoir. */
    $date = fn (?string $iso) => $iso === null ? '—' : Format::dateTime(CarbonImmutable::parse($iso));
    $day = fn (?string $d) => $d === null ? '—' : CarbonImmutable::parse($d)->format('d/m/Y');
    $hotel = $doc['hotel'] ?? [];
    $isCredit = ($doc['document']['type'] ?? '') === 'CREDIT_NOTE';
@endphp
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $doc['document']['label'] }} {{ $doc['document']['number'] }}</title>
    <style>
        @page { size: A4; margin: 18mm 15mm; }
        body { font-family: "DejaVu Sans", sans-serif; font-size: 10.5pt; color: #0f172a; }
        h1 { font-size: 18pt; margin: 0; color: #047857; }
        .muted { color: #475569; }
        .header { width: 100%; border-bottom: 2px solid #047857; padding-bottom: 8px; margin-bottom: 14px; }
        .header td { vertical-align: top; }
        .doc { text-align: right; }
        .doc .number { font-size: 13pt; font-weight: bold; }
        .box { border: 1px solid #cbd5e1; padding: 8px 10px; margin-bottom: 12px; }
        .box h2 { font-size: 10.5pt; margin: 0 0 4px; text-transform: uppercase; color: #475569; }
        table.lines { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        table.lines th { background: #f1f5f9; text-align: left; padding: 6px; border-bottom: 1px solid #cbd5e1; }
        table.lines td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
        .right { text-align: right; }
        .totals { width: 55%; margin-left: 45%; border-collapse: collapse; }
        .totals td { padding: 4px 6px; }
        .totals .net td { font-weight: bold; font-size: 12pt; border-top: 2px solid #0f172a; }
        .credit { border: 2px solid #b91c1c; color: #b91c1c; padding: 8px 10px; margin-bottom: 12px; font-weight: bold; }
        .verify { width: 100%; margin-top: 16px; border: 1px solid #cbd5e1; }
        .verify td { vertical-align: middle; padding: 6px; }
        .footer { margin-top: 18px; font-size: 8.5pt; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 6px; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <h1>{{ $hotel['name'] ?? 'JB Hôtel' }}</h1>
                @foreach (['address', 'city', 'phone', 'email'] as $field)
                    @if (! empty($hotel[$field]))<div class="muted">{{ $hotel[$field] }}</div>@endif
                @endforeach
                @if (! empty($hotel['tax_id']))<div class="muted">NIF : {{ $hotel['tax_id'] }}</div>@endif
                @if (! empty($hotel['trade_register']))<div class="muted">RCCM : {{ $hotel['trade_register'] }}</div>@endif
            </td>
            <td class="doc">
                <div class="number">{{ $doc['document']['label'] }} n° {{ $doc['document']['number'] }}</div>
                <div>Émis le {{ $date($doc['document']['issued_at'] ?? null) }}</div>
                <div class="muted">Statut : {{ $status }}</div>
            </td>
        </tr>
    </table>

    @if ($isCredit)
        <div class="credit">
            Avoir annulant la facture n° {{ $doc['credit']['credited_invoice_number'] }}
            du {{ $date($doc['credit']['credited_invoice_issued_at'] ?? null) }}.
            Motif : {{ $doc['credit']['reason'] }}
        </div>
    @endif

    <div class="box">
        <h2>Client</h2>
        <div><strong>{{ $doc['customer']['full_name'] ?? '—' }}</strong></div>
        @if (! empty($doc['customer']['phone']))<div>Téléphone : {{ $doc['customer']['phone'] }}</div>@endif
        @if (! empty($doc['customer']['email']))<div>E-mail : {{ $doc['customer']['email'] }}</div>@endif
        @if (! empty($doc['customer']['address']))<div>Adresse : {{ $doc['customer']['address'] }}</div>@endif
    </div>

    <div class="box">
        <h2>Séjour</h2>
        <div>Chambre {{ $doc['room']['number'] ?? '—' }} ({{ $doc['room']['type'] ?? '' }})</div>
        <div>
            Du {{ $day($doc['stay']['start_date'] ?? null) }}{{ ! empty($doc['stay']['start_time']) ? ' à '.$doc['stay']['start_time'] : '' }}
            au {{ $day($doc['stay']['end_date'] ?? null) }}{{ ! empty($doc['stay']['end_time']) ? ' à '.$doc['stay']['end_time'] : '' }}
        </div>
    </div>

    <table class="lines">
        <thead>
            <tr><th>Désignation</th><th class="right">Quantité</th><th class="right">Prix unitaire</th><th class="right">Montant</th></tr>
        </thead>
        <tbody>
            @foreach ($doc['lines'] as $line)
                <tr>
                    <td>{{ $line['label'] }}</td>
                    <td class="right">{{ $line['quantity'] }}</td>
                    <td class="right">{{ Format::fcfa($line['unit_price_fcfa']) }}</td>
                    <td class="right">{{ Format::fcfa($line['amount_fcfa']) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="totals">
        <tr><td>Montant brut</td><td class="right">{{ Format::fcfa($doc['totals']['gross_fcfa']) }}</td></tr>
        @if (($doc['totals']['discount_fcfa'] ?? 0) > 0)
            <tr>
                <td>Remise ({{ $doc['totals']['discount_label'] }}{{ ! empty($doc['totals']['discount_reason']) ? ' — '.$doc['totals']['discount_reason'] : '' }})</td>
                <td class="right">− {{ Format::fcfa($doc['totals']['discount_fcfa']) }}</td>
            </tr>
        @endif
        <tr class="net"><td>{{ $isCredit ? 'Montant de l’avoir' : 'Net à payer' }}</td><td class="right">{{ Format::fcfa($doc['totals']['net_fcfa']) }}</td></tr>
    </table>

    @if (! $isCredit)
        <table class="lines" style="margin-top: 14px;">
            <thead>
                <tr><th>Versements à la date d'émission</th><th>Date</th><th>Moyen</th><th class="right">Montant</th></tr>
            </thead>
            <tbody>
                @forelse ($doc['payments']['lines'] as $payment)
                    <tr>
                        <td>Reçu {{ $payment['receipt_number'] }}</td>
                        <td>{{ $date($payment['received_at']) }}</td>
                        <td>{{ $payment['method'] }}</td>
                        <td class="right">
                            {{ Format::fcfa($payment['amount_fcfa']) }}
                            @if ($payment['refunded_fcfa'] > 0)<br><span class="muted">dont remboursé : {{ Format::fcfa($payment['refunded_fcfa']) }}</span>@endif
                        </td>
                    </tr>
                @empty
                    <tr><td colspan="4" class="muted">Aucun versement à la date d'émission.</td></tr>
                @endforelse
            </tbody>
        </table>
        <table class="totals">
            <tr><td>Total encaissé (net)</td><td class="right">{{ Format::fcfa($doc['payments']['net_paid_fcfa']) }}</td></tr>
            <tr class="net"><td>Solde restant dû</td><td class="right">{{ Format::fcfa(max(0, $doc['payments']['balance_fcfa'])) }}</td></tr>
        </table>
    @endif

    <table class="verify">
        <tr>
            <td style="width: 34mm;"><img src="{{ $qr }}" alt="QR code de vérification" style="width: 30mm; height: 30mm;"></td>
            <td>
                <strong>Vérifiez l'authenticité de ce document</strong><br>
                Scannez ce QR code avec un téléphone, ou ouvrez l'adresse :<br>
                <span class="muted" style="font-size: 8pt;">{{ $verificationUrl }}</span>
            </td>
        </tr>
    </table>

    <div class="footer">
        Document émis par {{ $doc['issued_by']['name'] ?? '—' }}. Montants en francs CFA (FCFA).
        Ce document est figé à sa date d'émission ; toute correction fait l'objet d'un avoir.
    </div>
</body>
</html>
