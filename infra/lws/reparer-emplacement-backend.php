<?php

// A charger dans /htdocs puis a executer depuis le Terminal LWS, jamais par une URL.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

echo "Reparateur d'emplacement JB Hotel - version 2\n";

$webRoot = __DIR__;
$source = $webRoot.'/backend';
$home = dirname($webRoot).'/home';
$target = $home.'/jb-hotel-backend';

foreach (['artisan', 'vendor/autoload.php', 'bootstrap/app.php', '.env'] as $file) {
    if (! is_file($source.'/'.$file) || ! is_readable($source.'/'.$file)) {
        fwrite(STDERR, "Arret : backend/$file est absent ou illisible. Aucun deplacement effectue.\n");
        exit(1);
    }
}

if (is_link($source) || file_exists($target) || is_link($target)) {
    fwrite(STDERR, "Arret : le dossier prive existe deja ou la source est un lien. Aucun deplacement effectue.\n");
    exit(1);
}

// Les deux fichiers publics sont inclus : ils ne sont pas requis dans le projet source.
$entry = <<<'JB_PUBLIC_ENTRY'
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
JB_PUBLIC_ENTRY;

$rules = <<<'JB_PUBLIC_RULES'
# Publier dans /htdocs/backend/.htaccess, a cote du point d'entree index.php.
DirectoryIndex index.php
Options -Indexes -MultiViews

<IfModule !mod_rewrite.c>
    Require all denied
</IfModule>

<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /backend/

    RewriteRule (^|/)\. - [F,L]

    RewriteCond %{HTTP:Authorization} .
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]

    RewriteCond %{HTTP:X-XSRF-TOKEN} .
    RewriteRule .* - [E=HTTP_X_XSRF_TOKEN:%{HTTP:X-XSRF-TOKEN}]

    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.php [END]
</IfModule>
JB_PUBLIC_RULES;

if (! is_dir($home) && ! mkdir($home, 0755)) {
    fwrite(STDERR, "Impossible de creer le dossier home. Aucun deplacement effectue.\n");
    exit(1);
}

$staging = $home.'/.jb-public-'.bin2hex(random_bytes(6));
if (! mkdir($staging, 0755)) {
    fwrite(STDERR, "Impossible de preparer l'entree publique. Aucun deplacement effectue.\n");
    exit(1);
}

// Tous les chemins sont fixes sous le dossier du site ; ne remplacer aucun dossier existant.
if (file_put_contents($staging.'/index.php', $entry) === false
    || file_put_contents($staging.'/.htaccess', $rules) === false) {
    fwrite(STDERR, "Preparation impossible. Aucun deplacement effectue.\n");
    exit(1);
}

if (! rename($source, $target)) {
    fwrite(STDERR, "Deplacement refuse par l'hebergement. Le backend d'origine est conserve.\n");
    exit(1);
}

if (! rename($staging, $source)) {
    if (rename($target, $source)) {
        fwrite(STDERR, "Installation publique impossible ; backend restaure a son emplacement initial.\n");
    } else {
        fwrite(STDERR, "Le projet est dans home/jb-hotel-backend. Republier les fichiers publics dans htdocs/backend.\n");
    }
    exit(1);
}

echo "Projet deplace dans home/jb-hotel-backend ; entree publique installee dans htdocs/backend.\n";
echo "Aucune donnee ni configuration du projet n'a ete effacee.\n";
echo "Depuis le Terminal LWS, executer ensuite :\n";
echo "cd ~/home/jb-hotel-backend\nphp artisan config:clear\nphp artisan route:clear\nphp artisan config:cache\n";
