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
