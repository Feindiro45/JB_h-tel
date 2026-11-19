<?php

/*
| Paramètres propres à JB Hôtel, lus depuis l'environnement.
| Les règles métier modifiables par l'administrateur sont dans la table `settings`.
*/

return [

    // Mot de passe des comptes de démonstration (environnements local et testing uniquement).
    // Vide : un mot de passe aléatoire est généré et affiché par le seeder.
    'demo_users_password' => env('DEMO_USERS_PASSWORD'),

];
