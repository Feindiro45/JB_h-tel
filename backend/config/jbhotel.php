<?php

/*
| Paramètres propres à JB Hôtel, lus depuis l'environnement.
| Les règles métier modifiables par l'administrateur sont dans la table `settings`.
*/

return [

    // Mot de passe des comptes de démonstration (environnements local et testing uniquement).
    // Vide : un mot de passe aléatoire est généré et affiché par le seeder.
    'demo_users_password' => env('DEMO_USERS_PASSWORD'),

    // Adresse publique utilisée dans le QR code des factures (D-036). En production : le domaine
    // public de l'hôtel (ex. https://factures.jbhotel.cf), accessible depuis un téléphone.
    'verification_base_url' => env('VERIFICATION_BASE_URL', env('APP_URL', 'http://localhost:8000')),

    // Requêtes API par minute et par utilisateur (ou par adresse IP sans connexion).
    'api_rate_limit' => (int) env('API_RATE_LIMIT_PER_MINUTE', 120),

    // Adresse de l'application (écrans du personnel) utilisée dans les e-mails : lien pour choisir
    // son mot de passe (6M). Par défaut, la première origine de FRONTEND_URL.
    'frontend_url' => rtrim((string) env('APP_FRONTEND_URL', explode(',', (string) env('FRONTEND_URL', 'http://localhost:5173'))[0]), '/'),

    // Synchronisation des postes (D-069) : conservation du journal des changements (un poste peut
    // rester longtemps hors ligne), délai de sécurité avant d'avancer un curseur, rythme conseillé.
    'sync' => [
        'retention_days' => (int) env('SYNC_RETENTION_DAYS', 365),
        'commit_lag_seconds' => (int) env('SYNC_COMMIT_LAG_SECONDS', 15),
        'poll_seconds' => (int) env('SYNC_POLL_SECONDS', 30),
    ],

    // En-tête des factures et reçus. PROVISOIRE (Q-09, Q-16) : raison sociale, adresse, NIF et RCCM
    // à fournir par l'hôtel ; ces valeurs sont copiées dans chaque facture au moment de son émission.
    'hotel' => [
        'name' => env('HOTEL_NAME', 'JB Hôtel'),
        'address' => env('HOTEL_ADDRESS'),
        'city' => env('HOTEL_CITY', 'Bangui, République centrafricaine'),
        'phone' => env('HOTEL_PHONE'),
        'email' => env('HOTEL_EMAIL'),
        'tax_id' => env('HOTEL_TAX_ID'),
        'trade_register' => env('HOTEL_RCCM'),
    ],

];
