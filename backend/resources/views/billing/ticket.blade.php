@php
    use App\Shared\Support\Format;
    use Carbon\CarbonImmutable;

    /**
     * Ticket 80 mm d'une facture ou d'un avoir (D-065), envoyé au client par e-mail à la place de
     * l'ancienne facture A4. Construit uniquement depuis l'instantané figé `$doc` : mêmes montants à
     * chaque envoi. Mise en page en tableaux (dompdf ne gère pas flexbox), noir sur blanc comme le
     * ticket imprimé à la caisse (shared/ui/ThermalTicket).
     *
     * @var array<string, mixed> $doc
     */
    $timezone = (string) config('app.timezone');
    $at = fn (?string $iso) => $iso === null ? '—' : CarbonImmutable::parse($iso)->setTimezone($timezone)->format('d/m/Y H:i');
    $day = fn (?string $iso) => $iso === null ? '—' : CarbonImmutable::parse($iso)->setTimezone($timezone)->format('d/m/Y');
    $moment = fn (?string $date, ?string $time) => $date === null ? '—' : CarbonImmutable::parse($date)->format('d/m/Y').(! empty($time) ? ' '.substr((string) $time, 0, 5) : '');
    $hotel = $doc['hotel'] ?? [];
    $isCredit = ($doc['document']['type'] ?? '') === 'CREDIT_NOTE';
    $legal = array_filter([
        ! empty($hotel['tax_id']) ? 'NIF '.$hotel['tax_id'] : null,
        ! empty($hotel['trade_register']) ? 'RCCM '.$hotel['trade_register'] : null,
    ]);
    $methods = array_values(array_unique(array_map(fn (array $line) => (string) $line['method'], $doc['payments']['lines'] ?? [])));
    $stamp = $isCredit ? null : ($status === 'CREDITED' ? 'Annulée par avoir' : null);
@endphp
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Ticket {{ $doc['document']['label'] }} {{ $doc['document']['number'] }}</title>
    <style>
        @page { margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 4mm 4mm 6mm; font-family: 'DejaVu Sans', sans-serif; font-size: 8pt; line-height: 1.3; color: #000; }
        p { margin: 0 0 1.5pt; }
        .center { text-align: center; }
        .brand { font-size: 12pt; font-weight: bold; letter-spacing: 0.5pt; text-transform: uppercase; }
        .title { margin-top: 4pt; font-size: 9.5pt; font-weight: bold; text-transform: uppercase; }
        .stamp { display: inline-block; margin-top: 3pt; padding: 1pt 6pt; border: 1.5pt solid #000; font-weight: bold; text-transform: uppercase; }
        .rule { height: 0; margin: 4pt 0; border: 0; border-top: 0.8pt dashed #000; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 0.5pt 0; vertical-align: top; }
        td.value { text-align: right; white-space: nowrap; padding-left: 4pt; }
        tr.strong td { font-size: 9.5pt; font-weight: bold; padding-top: 2pt; }
        .head td { font-size: 7pt; font-weight: bold; text-transform: uppercase; border-bottom: 0.6pt solid #000; }
        .line-label { padding-top: 2pt; }
        .section { margin-top: 2pt; font-weight: bold; text-transform: uppercase; font-size: 7.5pt; }
        .note { font-size: 7pt; }
        .qr { margin: 4pt auto 2pt; width: 30mm; height: 30mm; }
        .url { font-size: 6pt; word-wrap: break-word; }
    </style>
</head>
<body>
    <div class="center">
        <p class="brand">{{ $hotel['name'] ?? 'JB Hôtel' }}</p>
        @foreach (array_filter([$hotel['address'] ?? null, $hotel['city'] ?? null]) as $line)
            <p>{{ $line }}</p>
        @endforeach
        @if (! empty($hotel['phone']))<p>Tél. : {{ $hotel['phone'] }}</p>@endif
        @if ($legal !== [])<p>{{ implode(' · ', $legal) }}</p>@endif
        <p class="title">{{ $doc['document']['label'] }}</p>
        @if ($stamp !== null)<p class="stamp">{{ $stamp }}</p>@endif
    </div>
    <hr class="rule">
    <table>
        <tr><td>N°</td><td class="value">{{ $doc['document']['number'] }}</td></tr>
        <tr><td>Date</td><td class="value">{{ $at($doc['document']['issued_at'] ?? null) }}</td></tr>
        @if (! empty($doc['issued_by']['name']))<tr><td>Émis par</td><td class="value">{{ $doc['issued_by']['name'] }}</td></tr>@endif
    </table>
    @if ($isCredit && ! empty($doc['credit']))
        <p class="note">Annule la facture n° {{ $doc['credit']['credited_invoice_number'] }} du {{ $day($doc['credit']['credited_invoice_issued_at'] ?? null) }}. Motif : {{ $doc['credit']['reason'] }}</p>
    @elseif (! $isCredit && ! empty($doc['replaces']['invoice_number']))
        <p class="note">Remplace la facture n° {{ $doc['replaces']['invoice_number'] }}{{ ! empty($doc['replaces']['reason']) ? ' — '.$doc['replaces']['reason'] : '' }}</p>
    @endif
    <hr class="rule">
    <table>
        <tr><td>Client</td><td class="value">{{ $doc['customer']['full_name'] ?? '—' }}</td></tr>
        <tr><td>Chambre</td><td class="value">{{ empty($doc['room']) ? '—' : $doc['room']['number'].(! empty($doc['room']['type']) ? ' ('.$doc['room']['type'].')' : '') }}</td></tr>
        <tr><td>Arrivée</td><td class="value">{{ $moment($doc['stay']['start_date'] ?? null, $doc['stay']['start_time'] ?? null) }}</td></tr>
        <tr><td>Départ</td><td class="value">{{ $moment($doc['stay']['end_date'] ?? null, $doc['stay']['end_time'] ?? null) }}</td></tr>
    </table>
    <hr class="rule">
    <table>
        <tr class="head"><td>Désignation</td><td class="value">Montant</td></tr>
        @foreach ($doc['lines'] as $line)
            <tr><td colspan="2" class="line-label">{{ $line['label'] }}</td></tr>
            <tr><td>{{ $line['quantity'] }} × {{ Format::fcfa((int) $line['unit_price_fcfa']) }}</td><td class="value">{{ Format::fcfa((int) $line['amount_fcfa']) }}</td></tr>
        @endforeach
    </table>
    <hr class="rule">
    <table>
        <tr><td>Sous-total</td><td class="value">{{ Format::fcfa((int) $doc['totals']['gross_fcfa']) }}</td></tr>
        @if (($doc['totals']['discount_fcfa'] ?? 0) > 0)
            <tr><td>Remise{{ ! empty($doc['totals']['discount_label']) ? ' ('.$doc['totals']['discount_label'].')' : '' }}</td><td class="value">− {{ Format::fcfa((int) $doc['totals']['discount_fcfa']) }}</td></tr>
        @endif
        <tr class="strong"><td>{{ $isCredit ? 'Montant de l’avoir' : 'Net à payer' }}</td><td class="value">{{ Format::fcfa((int) $doc['totals']['net_fcfa']) }}</td></tr>
    </table>
    @if (! empty($doc['totals']['discount_reason']))<p class="note">Motif de la remise : {{ $doc['totals']['discount_reason'] }}</p>@endif
    @if (! $isCredit)
        <hr class="rule">
        <p class="section">Versements à la date d’émission</p>
        <table>
            @forelse ($doc['payments']['lines'] as $payment)
                <tr><td>{{ $payment['receipt_number'] }} · {{ $day($payment['received_at']) }}</td><td class="value">{{ Format::fcfa((int) $payment['amount_fcfa'] - (int) $payment['refunded_fcfa']) }}</td></tr>
            @empty
                <tr><td colspan="2" class="note">Aucun versement.</td></tr>
            @endforelse
            <tr><td>Déjà réglé (net)</td><td class="value">{{ Format::fcfa((int) $doc['payments']['net_paid_fcfa']) }}</td></tr>
            <tr class="strong"><td>Reste dû</td><td class="value">{{ Format::fcfa(max(0, (int) $doc['payments']['balance_fcfa'])) }}</td></tr>
            @if ($methods !== [])<tr><td>Mode de paiement</td><td class="value">{{ implode(', ', $methods) }}</td></tr>@endif
        </table>
    @endif
    <hr class="rule">
    <div class="center">
        <p class="note">{{ $isCredit ? 'Cet avoir corrige le document référencé ci-dessus. Il ne constitue pas un remboursement.' : 'Document figé à sa date d’émission ; toute correction fait l’objet d’un avoir.' }}</p>
        <img class="qr" src="{{ $qr }}" alt="QR code de vérification">
        <p class="note"><strong>Vérifier ce document</strong> : scannez le QR code ou ouvrez</p>
        <p class="url">{{ $verificationUrl }}</p>
        @if (! $isCredit)<p>Merci pour votre séjour !</p>@endif
    </div>
</body>
</html>
