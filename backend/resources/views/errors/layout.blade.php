@php
    /*
     * Pages d'erreur du serveur (D-060) : liens publics (QR code des factures, désinscription) et
     * toute page web. Message en français, aucun détail technique, même identité que la page de
     * vérification. Les erreurs de l'API restent au format JSON (ApiExceptionRenderer).
     */
    $hotel = (string) config('jbhotel.hotel.name', 'JB Hôtel');
    $city = (string) config('jbhotel.hotel.city', 'Bangui, République centrafricaine');
    $contact = array_filter([config('jbhotel.hotel.phone'), config('jbhotel.hotel.email')]);
    $tone = $tone ?? 'warn';
@endphp
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>@yield('code') · @yield('title') — {{ $hotel }}</title>
    <style>
        :root { --green-900: #0b3d2c; --green-700: #00663f; --gold: #c9a24a; --gold-soft: #f4e7c4; --text: #12261e; --muted: #556860; --line: #dde6e1; --bg: #f3f6f4; --warn: #a55309; --warn-bg: #fff4e2; --ko: #b42318; --ko-bg: #fdecea; --info: #175d99; --info-bg: #e8f1fb; }
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.55; color: var(--text); background: var(--bg); }
        .wrap { width: min(100% - 32px, 620px); margin-inline: auto; }
        .top { background: var(--green-900); color: #fff; border-bottom: 3px solid var(--gold); }
        .top .wrap { display: flex; align-items: center; gap: 14px; padding: 18px 0; }
        .mark { flex: none; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 13px; background: var(--green-700); color: var(--gold-soft); font: 700 21px/1 Georgia, serif; }
        .brand b { display: block; }
        .brand small { display: block; color: #cfe3d8; font-size: .78rem; text-transform: uppercase; letter-spacing: .12em; }
        main { flex: 1; display: grid; place-items: center; padding: 32px 0; }
        .card { position: relative; overflow: hidden; width: 100%; padding: 34px 32px 28px; background: #fff; border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 1px 2px #0f2a2008, 0 18px 44px -20px #0f2a2033; text-align: center; }
        .card::before { content: ""; position: absolute; inset: 0 0 auto; height: 5px; background: var(--tone); }
        .tone-warn { --tone: var(--warn); --tone-bg: var(--warn-bg); }
        .tone-ko { --tone: var(--ko); --tone-bg: var(--ko-bg); }
        .tone-info { --tone: var(--info); --tone-bg: var(--info-bg); }
        .code { margin: 0; color: var(--tone); font: 800 clamp(3.4rem, 14vw, 5rem)/1 Inter, system-ui, sans-serif; letter-spacing: -.04em; opacity: .9; }
        .label { display: inline-block; margin: 10px 0 14px; padding: 4px 12px; border-radius: 999px; background: var(--tone-bg); color: var(--tone); font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        h1 { margin: 0 0 10px; font-size: clamp(1.35rem, 5vw, 1.7rem); letter-spacing: -.02em; }
        p { margin: 0 auto; max-width: 46ch; color: #34483f; }
        .hint { margin-top: 12px; color: var(--muted); font-size: .92rem; }
        .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 24px; }
        .actions a, .actions button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid transparent; font: 650 .95rem/1 Inter, system-ui, sans-serif; text-decoration: none; cursor: pointer; }
        .primary { background: #007c46; color: #fff; }
        .secondary { background: #eaf2ff; color: #17488f; border-color: #b8cdee !important; }
        .contact { margin-top: 20px; padding-top: 16px; border-top: 1px dashed var(--line); color: var(--muted); font-size: .88rem; }
        .contact a { color: var(--green-700); font-weight: 600; }
        footer { padding: 16px 0 24px; color: var(--muted); font-size: .8rem; text-align: center; }
        @media (max-width: 480px) { .card { padding: 28px 20px 22px; } }
    </style>
</head>
<body>
<header class="top">
    <div class="wrap">
        <span class="mark" aria-hidden="true">JB</span>
        <span class="brand"><b>{{ $hotel }}</b><small>{{ $city }}</small></span>
    </div>
</header>
<main class="wrap">
    <section class="card tone-{{ $tone }}" aria-labelledby="error-title">
        <p class="code" aria-hidden="true">@yield('code')</p>
        <span class="label">Erreur @yield('code')</span>
        <h1 id="error-title">@yield('title')</h1>
        <p>@yield('message')</p>
        @hasSection('hint')
            <p class="hint">@yield('hint')</p>
        @endif
        <div class="actions">
            @yield('actions')
            <button type="button" class="secondary" onclick="history.length > 1 ? history.back() : location.reload()">Revenir en arrière</button>
        </div>
        @if ($contact !== [])
            <p class="contact">Besoin d’aide ? Contactez l’hôtel :
                @foreach ($contact as $item)
                    @if (str_contains((string) $item, '@'))<a href="mailto:{{ $item }}">{{ $item }}</a>@else<a href="tel:{{ preg_replace('/[^+\d]/', '', (string) $item) }}">{{ $item }}</a>@endif{{ $loop->last ? '' : ' · ' }}
                @endforeach
            </p>
        @endif
    </section>
</main>
<footer class="wrap">© {{ now()->year }} {{ $hotel }}</footer>
</body>
</html>
