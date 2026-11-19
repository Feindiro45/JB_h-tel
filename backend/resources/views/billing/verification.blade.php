@php
    use App\Shared\Support\Format;
    use Carbon\CarbonImmutable;

    /** @var array<string, mixed>|null $result */
    $valid = $result !== null;
    $cancelled = $valid && $result['status'] === 'CREDITED';
@endphp
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Vérification de document — JB Hôtel</title>
    <style>
        :root { --primary: #047857; --text: #0f172a; --muted: #475569; --error: #b91c1c; --warning: #b45309; --bg: #f8fafc; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 16px; line-height: 1.5; color: var(--text); background: var(--bg); }
        main { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
        .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 24px; }
        .brand { color: var(--primary); font-weight: 700; margin: 0 0 16px; }
        h1 { font-size: 1.375rem; margin: 0 0 8px; display: flex; gap: 8px; align-items: center; }
        .ok h1 { color: var(--primary); }
        .ko h1 { color: var(--error); }
        .warn { border-left: 6px solid var(--warning); background: #fffbeb; padding: 12px; margin: 16px 0; color: #78350f; }
        dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 16px 0 0; }
        dt { color: var(--muted); }
        dd { margin: 0; font-weight: 600; }
        .muted { color: var(--muted); font-size: 0.875rem; margin-top: 16px; }
    </style>
</head>
<body>
<main>
    <div class="card {{ $valid ? 'ok' : 'ko' }}">
        <p class="brand">{{ $valid ? $result['issuer'] : 'JB Hôtel' }}</p>

        @if ($valid)
            <h1><span aria-hidden="true">✓</span> Document authentique</h1>
            <p>Ce document a bien été émis par {{ $result['issuer'] }}.</p>

            @if ($cancelled)
                <div class="warn" role="alert">
                    <strong>Attention : cette facture a été annulée</strong>
                    @if ($result['credited_by_number']) par l'avoir n° {{ $result['credited_by_number'] }}@endif.
                    Elle n'est plus exigible.
                </div>
            @endif

            <dl>
                <dt>Document</dt><dd>{{ $result['type_label'] }} n° {{ $result['number'] }}</dd>
                <dt>Date d'émission</dt><dd>{{ Format::dateTime(CarbonImmutable::parse($result['issued_at'])) }}</dd>
                <dt>Montant net</dt><dd>{{ Format::fcfa($result['net_fcfa']) }}</dd>
                <dt>Statut</dt><dd>{{ $result['status_label'] }}</dd>
                @if ($result['credits_invoice_number'])
                    <dt>Annule la facture</dt><dd>n° {{ $result['credits_invoice_number'] }}</dd>
                @endif
                @if ($result['customer_initials'] !== '')
                    <dt>Client</dt><dd>{{ $result['customer_initials'] }}</dd>
                @endif
            </dl>
            <p class="muted">Seules les informations nécessaires à la vérification sont affichées, pour protéger les données du client.</p>
        @else
            <h1><span aria-hidden="true">✕</span> Document introuvable</h1>
            <p>Aucun document ne correspond à ce QR code.</p>
            <p>Il peut s'agir d'un document falsifié, d'un lien incomplet ou mal recopié. En cas de doute, contactez directement l'hôtel.</p>
        @endif
    </div>
</main>
</body>
</html>
