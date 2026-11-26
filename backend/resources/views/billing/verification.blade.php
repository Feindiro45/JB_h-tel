@php
    use App\Shared\Support\Format;
    use Carbon\CarbonImmutable;

    /** @var array<string, mixed>|null $result */
    /** @var array<string, string|null> $hotel */
    $valid = $result !== null;
    $cancelled = $valid && $result['status'] === 'CREDITED';
    $isCredit = $valid && $result['type'] === 'CREDIT_NOTE';
    $tone = ! $valid ? 'ko' : ($cancelled ? 'warn' : 'ok');
    $hotelName = $valid ? $result['issuer'] : ($hotel['name'] ?? 'JB Hôtel');
    $city = $hotel['city'] ?? 'Bambari, République centrafricaine';
    $contact = array_filter([$hotel['phone'] ?? null, $hotel['email'] ?? null]);
@endphp
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="color-scheme" content="light">
    <title>{{ $valid ? 'Document authentique' : 'Document introuvable' }} — Vérification {{ $hotelName }}</title>
    <style>
        :root {
            --green-900: #0b3d2c; --green-800: #0f4d38; --green-700: #00663f; --green-600: #007c46; --green-50: #ecf6f0;
            --gold: #c9a24a; --gold-soft: #f4e7c4; --text: #12261e; --muted: #556860; --line: #dde6e1; --bg: #f3f6f4;
            --ok: #007c46; --ok-bg: #e7f4ec; --warn: #a55309; --warn-bg: #fff4e2; --ko: #b42318; --ko-bg: #fdecea;
        }
        * { box-sizing: border-box; }
        html { -webkit-text-size-adjust: 100%; }
        body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 16px; line-height: 1.55; color: var(--text); background: var(--bg); }
        .wrap { width: min(100% - 32px, 680px); margin-inline: auto; }
        .top { background: var(--green-900); color: #fff; border-bottom: 3px solid var(--gold); }
        .top .wrap { display: flex; align-items: center; gap: 14px; padding: 18px 0; }
        .mark { flex: none; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 13px; background: var(--green-700); color: var(--gold-soft); font: 700 21px/1 Georgia, "Times New Roman", serif; letter-spacing: .02em; box-shadow: inset 0 0 0 1px #ffffff1f; }
        .brand b { display: block; font-size: 1.05rem; letter-spacing: .01em; }
        .brand small { display: block; color: #cfe3d8; font-size: .78rem; text-transform: uppercase; letter-spacing: .12em; }
        .tag { margin-left: auto; padding: 6px 12px; border: 1px solid #ffffff38; border-radius: 999px; color: var(--gold-soft); font-size: .78rem; font-weight: 600; white-space: nowrap; }
        main { flex: 1; padding: 28px 0 36px; display: grid; gap: 18px; align-content: start; }
        .card { background: #fff; border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 1px 2px #0f2a2008, 0 14px 40px -18px #0f2a2030; }
        .verdict { display: flex; gap: 18px; align-items: center; padding: 26px; border-top: 5px solid var(--tone); }
        .tone-ok { --tone: var(--ok); --tone-bg: var(--ok-bg); }
        .tone-warn { --tone: var(--warn); --tone-bg: var(--warn-bg); }
        .tone-ko { --tone: var(--ko); --tone-bg: var(--ko-bg); }
        .seal { flex: none; display: grid; place-items: center; width: 68px; height: 68px; border-radius: 50%; background: var(--tone-bg); color: var(--tone); box-shadow: 0 0 0 6px #fff, 0 0 0 7px var(--tone-bg); }
        .seal svg { width: 34px; height: 34px; }
        .eyebrow { margin: 0 0 2px; color: var(--muted); font-size: .76rem; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; }
        h1 { margin: 0 0 4px; color: var(--tone); font-size: clamp(1.45rem, 5vw, 1.8rem); line-height: 1.2; letter-spacing: -.02em; }
        .verdict p:last-child { margin: 0; color: #2b3d35; }
        .alert { display: flex; gap: 12px; padding: 16px 18px; border-radius: 14px; background: var(--warn-bg); border: 1px solid #f0cf9b; color: #6b3a07; }
        .alert svg { flex: none; width: 22px; height: 22px; margin-top: 2px; color: var(--warn); }
        .alert strong { color: #5a3005; }
        .doc { padding: 24px 26px; }
        .doc-head { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; padding-bottom: 18px; border-bottom: 1px dashed var(--line); }
        h2 { margin: 0; font-size: 1.2rem; letter-spacing: -.01em; }
        .number { font-variant-numeric: tabular-nums; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; font-size: .82rem; font-weight: 700; background: var(--tone-bg); color: var(--tone); }
        .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
        .amount { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 18px 0; padding: 16px 18px; border-radius: 14px; background: var(--green-50); }
        .amount span { color: var(--muted); font-weight: 600; }
        .amount strong { color: var(--green-800); font-size: clamp(1.45rem, 5vw, 1.75rem); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
        dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 22px; margin: 0; }
        dl div { min-width: 0; }
        dt { color: var(--muted); font-size: .82rem; }
        dd { margin: 2px 0 0; font-weight: 650; overflow-wrap: anywhere; }
        .note { display: flex; gap: 12px; padding: 18px 20px; color: #3d5048; font-size: .9rem; }
        .note svg { flex: none; width: 20px; height: 20px; margin-top: 2px; color: var(--green-600); }
        .note p { margin: 0; }
        .note p + p { margin-top: 6px; color: var(--muted); }
        .help { padding: 22px 26px; }
        .help ol { margin: 12px 0 0; padding-left: 22px; }
        .help li + li { margin-top: 6px; }
        .contact { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); font-weight: 600; }
        .contact a { color: var(--green-700); }
        footer { padding: 18px 0 26px; color: var(--muted); font-size: .8rem; text-align: center; }
        @media (max-width: 520px) {
            .tag { display: none; }
            .verdict { flex-direction: column; align-items: flex-start; padding: 22px 20px; }
            .doc, .help { padding: 20px; }
            dl { grid-template-columns: minmax(0, 1fr); }
        }
        @media print {
            body { background: #fff; }
            .top { background: #fff; color: var(--text); border-bottom-color: var(--text); }
            .brand small, .tag { color: var(--muted); }
            .card { box-shadow: none; }
        }
    </style>
</head>
<body>
<header class="top">
    <div class="wrap">
        <span class="mark" aria-hidden="true">JB</span>
        <span class="brand"><b>{{ $hotelName }}</b><small>{{ $city }}</small></span>
        <span class="tag">Vérification officielle</span>
    </div>
</header>

<main class="wrap">
    <section class="card verdict tone-{{ $tone }}" role="status" aria-labelledby="verdict-title">
        <div class="seal" aria-hidden="true">
            @if (! $valid)
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            @elseif ($cancelled)
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18.5a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
            @else
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 4.5 5.6v5.9c0 4.7 3.2 8.4 7.5 9.7 4.3-1.3 7.5-5 7.5-9.7V5.6Z"/><path d="m8.6 12.1 2.4 2.4 4.6-4.8"/></svg>
            @endif
        </div>
        <div>
            <p class="eyebrow">Résultat de la vérification</p>
            @if ($valid)
                <h1 id="verdict-title">Document authentique</h1>
                <p>Ce document a bien été émis par {{ $result['issuer'] }}. Les informations ci-dessous sont celles enregistrées à son émission.</p>
            @else
                <h1 id="verdict-title">Document introuvable</h1>
                <p>Aucun document ne correspond à ce QR code ou à ce lien.</p>
            @endif
        </div>
    </section>

    @if ($valid)
        @if ($cancelled)
            <div class="alert" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5M12 16.5h.01"/></svg>
                <p style="margin:0"><strong>Attention : cette facture a été annulée</strong>@if ($result['credited_by_number']) par l’avoir n° <span class="number">{{ $result['credited_by_number'] }}</span>@endif. Elle n’est plus exigible : ne réglez aucun montant sur sa base.</p>
            </div>
        @endif

        <section class="card doc tone-{{ $tone }}" aria-labelledby="doc-title">
            <div class="doc-head">
                <div>
                    <p class="eyebrow">Document vérifié</p>
                    <h2 id="doc-title" class="number">{{ $result['type_label'] }} n° {{ $result['number'] }}</h2>
                </div>
                <span class="pill">{{ $result['status_label'] }}</span>
            </div>
            <div class="amount">
                <span>{{ $isCredit ? 'Montant de l’avoir' : 'Montant net' }}</span>
                <strong>{{ Format::fcfa($result['net_fcfa']) }}</strong>
            </div>
            <dl>
                <div><dt>Date d’émission</dt><dd>{{ Format::dateTime(CarbonImmutable::parse($result['issued_at'])) }}</dd></div>
                <div><dt>Émetteur</dt><dd>{{ $result['issuer'] }}</dd></div>
                @if ($result['customer_initials'] !== '')
                    <div><dt>Client (initiales)</dt><dd>{{ $result['customer_initials'] }}</dd></div>
                @endif
                @if ($result['credits_invoice_number'])
                    <div><dt>Annule la facture</dt><dd class="number">n° {{ $result['credits_invoice_number'] }}</dd></div>
                @endif
            </dl>
        </section>

        <section class="card note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
            <div>
                <p>Seules les informations nécessaires à la vérification sont affichées, pour protéger les données du client.</p>
                <p>Vérification effectuée le {{ $checkedAt }} (heure de Centrafrique). Comparez le numéro et le montant avec le document que vous avez en main.</p>
            </div>
        </section>
    @else
        <section class="card help" aria-labelledby="help-title">
            <h2 id="help-title">Que faire ?</h2>
            <p style="margin:6px 0 0;color:var(--muted)">Il peut s’agir d’un document falsifié, d’un lien incomplet ou mal recopié.</p>
            <ol>
                <li>Scannez de nouveau le QR code imprimé sur la facture ou l’avoir.</li>
                <li>Si vous avez saisi le lien à la main, vérifiez qu’il est complet, code compris.</li>
                <li>En cas de doute, ne réglez rien et contactez directement l’hôtel.</li>
            </ol>
            @if ($contact !== [])
                <p class="contact">
                    Contact de l’hôtel :
                    @foreach ($contact as $item)
                        @if (str_contains($item, '@'))<a href="mailto:{{ $item }}">{{ $item }}</a>@else<a href="tel:{{ preg_replace('/[^+\d]/', '', $item) }}">{{ $item }}</a>@endif{{ $loop->last ? '' : ' · ' }}
                    @endforeach
                </p>
            @endif
        </section>
    @endif
</main>

<footer class="wrap">
    © {{ now()->year }} {{ $hotelName }} · Page officielle de vérification des factures et avoirs
</footer>
</body>
</html>
