<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Le frontal PHP du mutualise peut annoncer /index.php au lieu de /backend/index.php.
// Symfony doit retirer /backend du chemin avant la recherche des routes Laravel.
// Ne pas changer REQUEST_URI : conserver la route demandee et ses parametres.
$_SERVER['SCRIPT_NAME'] = '/backend/index.php';
$_SERVER['PHP_SELF'] = '/backend/index.php';
$_SERVER['SCRIPT_FILENAME'] = __FILE__;

// /htdocs/backend contient seulement l'entree publique ; le projet est hors de /htdocs.
$backendPath = dirname(__DIR__, 2).'/home/jb-hotel-backend';

if (! is_file($backendPath.'/vendor/autoload.php') || ! is_file($backendPath.'/bootstrap/app.php')) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['title' => 'Service indisponible', 'message' => 'Le service est en cours de configuration. Réessayez dans quelques instants.']);
    exit;
}

if (file_exists($maintenance = $backendPath.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $backendPath.'/vendor/autoload.php';

/** @var Application $app */
$app = require_once $backendPath.'/bootstrap/app.php';
$app->usePublicPath(__DIR__);
$app->handleRequest(Request::capture());
