<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Désinscription — {{ config('jbhotel.hotel.name', 'JB Hôtel') }}</title>
    <style>
        body { margin: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 16px; line-height: 1.5; color: #0f172a; background: #f8fafc; }
        main { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
        .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 24px; }
        .brand { color: #047857; font-weight: 700; margin: 0 0 16px; }
        h1 { font-size: 1.375rem; margin: 0 0 8px; }
    </style>
</head>
<body>
<main>
    <div class="card">
        <p class="brand">{{ config('jbhotel.hotel.name', 'JB Hôtel') }}</p>
        @if ($done)
            <h1>Désinscription enregistrée</h1>
            <p>Vous ne recevrez plus d'e-mails concernant vos séjours. Vous pouvez demander à la réception de les réactiver à tout moment.</p>
        @else
            <h1>Lien invalide</h1>
            <p>Ce lien de désinscription n'est pas valide. Contactez la réception de l'hôtel.</p>
        @endif
    </div>
</main>
</body>
</html>
