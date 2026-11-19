@php
    use App\Shared\Support\Format;
    use Carbon\CarbonImmutable;

    /** @var array<string, mixed> $doc Instantané figé : ne jamais relire les données courantes. */
    $date = fn (?string $iso) => $iso === null ? '—' : Format::dateTime(CarbonImmutable::parse($iso));
    $day = fn (?string $d) => $d === null ? '—' : CarbonImmutable::parse($d)->locale('fr')->translatedFormat('d F Y');
    $hotel = $doc['hotel'] ?? [];
    $isCredit = ($doc['document']['type'] ?? '') === 'CREDIT_NOTE';
    $icons = [
        'client' => '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
        'calendar' => '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
        'bed' => '<path d="M3 4v17m18-8v8M3 17h18M3 9h6v8m0-6h9a3 3 0 0 1 3 3v3"/>',
        'phone' => '<path d="m5 3 4 4-2 3a14 14 0 0 0 7 7l3-2 4 4-2 3C10 22 2 14 2 5Z"/>',
        'mail' => '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 5 10 8L22 5"/>',
        'pin' => '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
        'check' => '<circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/>',
        'comment' => '<path d="M21 11a9 9 0 0 1-9 9H4l-3 3V11a10 10 0 0 1 20 0Z"/><path d="M6 8h10M6 12h8"/>',
    ];
    $icon = fn (string $name) => 'data:image/svg+xml;base64,'.base64_encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#005c3d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'.$icons[$name].'</svg>');
@endphp
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $doc['document']['label'] }} {{ $doc['document']['number'] }}</title>
    <style>
        @page { size: A4; margin: 10mm 11mm 22mm; }
        body { margin: 0; font-family: "DejaVu Sans", sans-serif; font-size: 8.5pt; line-height: 1.25; color: #182b25; }
        table { width: 100%; border-collapse: collapse; }
        td { vertical-align: top; }
        .muted { color: #63736c; }
        .right { text-align: right; }
        .amount { white-space: nowrap; }
        .icon { width: 3.5mm; height: 3.5mm; vertical-align: middle; margin-right: 2mm; }
        .masthead { margin-bottom: 4mm; }
        .brand { width: 48%; padding-right: 5mm; }
        .brand-name { font-size: 24pt; line-height: 1.1; color: #004c35; font-weight: bold; }
        .monogram { font-family: "DejaVu Serif", serif; font-size: 36pt; color: #c7a13c; line-height: 1; margin-right: 2mm; }
        .brand-rule { width: 18mm; border-top: 2px solid #cfad46; margin: 2mm 0; }
        .contact { font-size: 8pt; margin-bottom: 1mm; overflow-wrap: break-word; }
        .legal { font-size: 7pt; margin-top: 1mm; }
        .hero { width: 52%; }
        .photo { height: 22mm; overflow: hidden; position: relative; border-top: 3px solid #c7a13c; }
        .photo img { width: 100%; }
        .photo-angle { position: absolute; top: -1mm; left: -1mm; width: 0; height: 0; border-top: 31mm solid #fff; border-right: 14mm solid transparent; }
        .doc-title { background: #004c35; color: #fff; text-align: center; padding: 3mm 2mm; border-radius: 0 0 3mm 3mm; }
        .doc-title h1 { font-size: 23pt; line-height: 1.1; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 1mm; }
        .doc-number { font-size: 11pt; font-weight: bold; }
        .parties { margin-bottom: 4mm; }
        .client { width: 47%; background: #eef5f0; border-radius: 3mm; padding: 0 4mm 4mm; }
        h2 { font-size: 11pt; line-height: 1.3; color: #005c3d; margin: 0 0 2mm; }
        .client h2 { padding: 1.5mm 0; border-bottom: 2px solid #c7a13c; }
        .client-name { font-size: 12pt; font-weight: bold; margin: 2mm 0; overflow-wrap: break-word; }
        .gap { width: 5%; }
        .details { width: 48%; padding-left: 4mm; }
        .detail { padding: 1mm 0; border-bottom: 1px solid #d8e1dc; }
        .detail strong { color: #004c35; }
        .status { margin-top: 2mm; padding: 1.5mm 3mm; background: #e7f5e9; color: #005c3d; border-radius: 2mm; font-weight: bold; }
        .credit { margin: 0 0 5mm; padding: 3mm; border-left: 3px solid #b7791f; background: #fff6e8; color: #744b13; }
        .lines { margin-bottom: 4mm; }
        .lines thead { display: table-header-group; }
        .lines th { padding: 1.8mm 2mm; background: #005c3d; color: #fff; text-align: left; font-size: 8pt; white-space: nowrap; }
        .lines td { padding: 1.8mm 2mm; border-bottom: 1px solid #dce5df; }
        .lines tbody tr:nth-child(even) { background: #f5f8f6; }
        .lines tr { page-break-inside: avoid; }
        .lines .right { text-align: right; }
        .lines .index { width: 6mm; text-align: center; color: #6a7a72; }
        .lines th.index { color: #fff; }
        .summary { margin-bottom: 3mm; page-break-inside: avoid; }
        .summary-note { width: 44%; padding: 2mm 3mm; background: #eef5f0; border-radius: 3mm; font-size: 8pt; }
        .summary-note p { margin: 2mm 0 0; }
        .summary-gap { width: 5%; }
        .summary-totals { width: 51%; }
        .totals td { padding: 1.5mm 2.5mm; background: #eef5f0; border-bottom: 1mm solid white; }
        .totals .net td { background: #005c3d; color: #fff; font-size: 10pt; font-weight: bold; padding: 2mm 2.5mm; }
        .discount-reason { font-size: 7pt; color: #63736c; margin-top: 1mm; }
        .payments-title { margin-top: 3mm; }
        .payments { font-size: 7.5pt; }
        .payments th { padding: 2mm; background: #eaf1ec; color: #224b3c; }
        .payments td { padding: 2mm; }
        .balance { margin: 2mm 0 5mm; page-break-inside: avoid; }
        .balance td { width: 50%; padding: 2mm 3mm; border: 1px solid #d8e1dc; }
        .balance .due { background: #eef5f0; }
        .comment { border: 1px solid #d8e1dc; border-radius: 3mm; padding: 2mm 3mm; margin: 3mm 0; page-break-inside: avoid; }
        .comment p { margin: 0; font-size: 8pt; }
        .closing { page-break-inside: avoid; }
        .verify { margin-top: 4mm; page-break-inside: avoid; }
        .verify td { vertical-align: middle; }
        .qr { width: 27mm; padding-right: 3mm; }
        .qr img { width: 26mm; height: 26mm; }
        .verify-copy { width: 62%; padding-right: 4mm; }
        .verify-title { color: #004c35; font-size: 10pt; font-weight: bold; }
        .url { font-size: 6.5pt; color: #63736c; overflow-wrap: anywhere; word-break: break-all; }
        .issuer { padding-left: 4mm; border-left: 1px solid #d8e1dc; font-size: 8pt; }
        .issuer strong { display: block; margin-top: 1mm; color: #004c35; }
        .footer { position: fixed; bottom: -16mm; left: -11mm; right: -11mm; height: 12mm; padding: 3mm 11mm 0; background: #004c35; color: white; border-top: 2px solid #c7a13c; font-size: 8pt; }
        .footer .tagline { text-align: center; font-family: "DejaVu Serif", serif; font-style: italic; }
        .page { position: absolute; right: 11mm; top: 3mm; font-size: 7pt; color: #dcece3; }
        .page:after { content: counter(page); }
    </style>
</head>
<body>
    <div class="footer"><div class="tagline">{{ $hotel['name'] ?? 'JB Hôtel' }} - Confort, Service et Hospitalité</div><span class="page">Page </span></div>
    <table class="masthead"><tr>
        <td class="brand">
            <div><span class="monogram">JB</span><span class="brand-name">{{ $hotel['name'] ?? 'JB Hôtel' }}</span></div>
            <div class="brand-rule"></div>
            @foreach (['address' => 'pin', 'city' => 'pin', 'phone' => 'phone', 'email' => 'mail'] as $field => $symbol)
                @if (! empty($hotel[$field]))<div class="contact"><img class="icon" src="{{ $icon($symbol) }}" alt="">{{ $hotel[$field] }}</div>@endif
            @endforeach
            <div class="legal">@if (! empty($hotel['tax_id']))NIF : {{ $hotel['tax_id'] }} @endif @if (! empty($hotel['trade_register']))· RCCM : {{ $hotel['trade_register'] }}@endif</div>
        </td>
        <td class="hero">
            <div class="photo"><img src="{{ resource_path('images/jb-hotel.jpg') }}" alt=""><div class="photo-angle"></div></div>
            <div class="doc-title"><h1>{{ $doc['document']['label'] }}</h1><div class="doc-number">N° {{ $doc['document']['number'] }}</div></div>
        </td>
    </tr></table>
    @if ($isCredit)
        <div class="credit"><strong>Avoir annulant la facture n° {{ $doc['credit']['credited_invoice_number'] }}</strong><br>
            Émise le {{ $date($doc['credit']['credited_invoice_issued_at'] ?? null) }}.<br>Motif : {{ $doc['credit']['reason'] }}
        </div>
    @elseif (! empty($doc['replaces']['invoice_number']))
        <div class="credit"><strong>Facture remplaçant la facture n° {{ $doc['replaces']['invoice_number'] }}</strong><br>
            {{ $doc['replaces']['reason'] ?? '' }}
        </div>
    @endif
    <table class="parties"><tr>
        <td class="client">
            <h2><img class="icon" src="{{ $icon('client') }}" alt="">Client</h2>
            <div class="client-name">{{ $doc['customer']['full_name'] ?? '—' }}</div>
            @foreach (['phone' => 'phone', 'email' => 'mail', 'address' => 'pin'] as $field => $symbol)
                @if (! empty($doc['customer'][$field]))<div class="contact"><img class="icon" src="{{ $icon($symbol) }}" alt="">{{ $doc['customer'][$field] }}</div>@endif
            @endforeach
        </td><td class="gap"></td>
        <td class="details">
            <div class="detail"><img class="icon" src="{{ $icon('calendar') }}" alt=""><strong>Date d'émission</strong><br>{{ $date($doc['document']['issued_at'] ?? null) }}</div>
            <div class="detail"><img class="icon" src="{{ $icon('bed') }}" alt=""><strong>Chambre {{ $doc['room']['number'] ?? '—' }}</strong> · {{ $doc['room']['type'] ?? '' }}</div>
            <div class="detail"><img class="icon" src="{{ $icon('calendar') }}" alt=""><strong>Séjour</strong><br>
                Du {{ $day($doc['stay']['start_date'] ?? null) }}{{ ! empty($doc['stay']['start_time']) ? ' à '.$doc['stay']['start_time'] : '' }}<br>
                au {{ $day($doc['stay']['end_date'] ?? null) }}{{ ! empty($doc['stay']['end_time']) ? ' à '.$doc['stay']['end_time'] : '' }}
            </div>
            <div class="status"><img class="icon" src="{{ $icon('check') }}" alt="">Statut : {{ $status }}</div>
        </td>
    </tr></table>
    <table class="lines">
        <thead><tr><th class="index">N°</th><th>Désignation</th><th class="right">Qté</th><th class="right">Prix unitaire</th><th class="right">Montant</th></tr></thead>
        <tbody>
            @foreach ($doc['lines'] as $line)
                <tr><td class="index">{{ $loop->iteration }}</td><td>{{ $line['label'] }}</td><td class="right">{{ $line['quantity'] }}</td><td class="right amount">{{ Format::fcfa($line['unit_price_fcfa']) }}</td><td class="right amount"><strong>{{ Format::fcfa($line['amount_fcfa']) }}</strong></td></tr>
            @endforeach
        </tbody>
    </table>
    <table class="summary"><tr>
        <td class="summary-note"><h2><img class="icon" src="{{ $icon('bed') }}" alt="">Votre séjour</h2>
            <p>Les prestations facturées sont détaillées ci-dessus. Tous les montants sont exprimés en francs CFA (FCFA).</p>
            @if (! empty($doc['stay']['period_is_estimated']))<p>Horaires non renseignés à l'émission.</p>@endif
        </td><td class="summary-gap"></td>
        <td class="summary-totals"><table class="totals">
            <tr><td>Sous-total</td><td class="right amount">{{ Format::fcfa($doc['totals']['gross_fcfa']) }}</td></tr>
            <tr><td>Remise{{ ! empty($doc['totals']['discount_label']) ? ' ('.$doc['totals']['discount_label'].')' : '' }}</td><td class="right amount">{{ ($doc['totals']['discount_fcfa'] ?? 0) > 0 ? '− ' : '' }}{{ Format::fcfa($doc['totals']['discount_fcfa'] ?? 0) }}</td></tr>
            <tr class="net"><td>{{ $isCredit ? 'Montant de l’avoir' : 'Net à payer' }}</td><td class="right amount">{{ Format::fcfa($doc['totals']['net_fcfa']) }}</td></tr>
        </table>
            @if (! empty($doc['totals']['discount_reason']))<div class="discount-reason">Motif de la remise : {{ $doc['totals']['discount_reason'] }}</div>@endif
        </td>
    </tr></table>
    @if (! $isCredit)
        <h2 class="payments-title">Versements à la date d'émission</h2>
        <table class="lines payments">
            <thead><tr><th>Reçu</th><th>Date</th><th>Moyen</th><th class="right">Montant</th></tr></thead>
            <tbody>
                @forelse ($doc['payments']['lines'] as $payment)
                    <tr><td>{{ $payment['receipt_number'] }}</td><td>{{ $date($payment['received_at']) }}</td><td>{{ $payment['method'] }}</td><td class="right amount">{{ Format::fcfa($payment['amount_fcfa']) }}
                        @if ($payment['refunded_fcfa'] > 0)<br><span class="muted">dont remboursé : {{ Format::fcfa($payment['refunded_fcfa']) }}</span>@endif
                    </td></tr>
                @empty
                    <tr><td colspan="4" class="muted">Aucun versement à la date d'émission.</td></tr>
                @endforelse
            </tbody>
        </table>
        <table class="balance"><tr><td>Total encaissé (net)<br><strong>{{ Format::fcfa($doc['payments']['net_paid_fcfa']) }}</strong></td><td class="due">Solde restant dû<br><strong>{{ Format::fcfa(max(0, $doc['payments']['balance_fcfa'])) }}</strong></td></tr></table>
    @endif
    <div class="closing">
    <div class="comment"><h2><img class="icon" src="{{ $icon('comment') }}" alt="">{{ $isCredit ? 'Information' : 'Merci pour votre séjour' }}</h2>
        <p>{{ $isCredit ? 'Cet avoir corrige le document référencé ci-dessus. Il ne constitue pas un remboursement.' : 'Nous restons à votre disposition pour tout besoin futur.' }}</p>
        <p class="muted">Document figé à sa date d'émission ; toute correction fait l'objet d'un avoir.</p>
    </div>
    <table class="verify"><tr>
        <td class="qr"><img src="{{ $qr }}" alt="QR code de vérification"></td>
        <td class="verify-copy"><div class="verify-title">Vérifier ce document</div>Scannez le QR code ou ouvrez ce lien :<br><span class="url">{{ $verificationUrl }}</span></td>
        <td class="issuer">Document émis par<strong>{{ $doc['issued_by']['name'] ?? '—' }}</strong>{{ $hotel['name'] ?? 'JB Hôtel' }}</td>
    </tr></table>
    </div>
</body>
</html>
