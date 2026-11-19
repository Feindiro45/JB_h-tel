<?php

/** Prépare uniquement jb_hotel_e2e, jamais la base de travail. */
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment(['local', 'testing'])) {
    throw new RuntimeException('La préparation E2E est réservée au développement.');
}
DB::statement('CREATE DATABASE IF NOT EXISTS `jb_hotel_e2e` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
config(['database.connections.mysql.database' => 'jb_hotel_e2e', 'database.connections.mysql.url' => null]);
DB::purge('mysql');
if (DB::connection()->getDatabaseName() !== 'jb_hotel_e2e') {
    throw new RuntimeException('Base E2E incorrecte.');
}
$password = bin2hex(random_bytes(16)).'Aa7';
config(['jbhotel.demo_users_password' => $password]);
Artisan::call('migrate:fresh', ['--seed' => true, '--force' => true]);
$path = storage_path('framework/testing');
if (! is_dir($path)) {
    mkdir($path, 0700, true);
}
file_put_contents($path.'/e2e.local.json', json_encode(['password' => $password], JSON_THROW_ON_ERROR));
chmod($path.'/e2e.local.json', 0600);
echo 'Base E2E isolée préparée.'.PHP_EOL;
