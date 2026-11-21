<?php

/*
| CORS : le frontend React est une application distincte (docs/DECISIONS.md D-001, D-005).
| Les cookies de session Sanctum (mode SPA) exigent supports_credentials et des origines explicites :
| jamais de joker « * » avec des identifiants.
*/

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    // FRONTEND_URL peut contenir plusieurs origines séparées par des virgules.
    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('FRONTEND_URL', 'http://localhost:5173'))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Content-Type', 'X-Requested-With', 'X-XSRF-TOKEN', 'X-Workstation-Token'],

    'exposed_headers' => ['Retry-After'],

    'max_age' => 600,

    'supports_credentials' => true,

];
