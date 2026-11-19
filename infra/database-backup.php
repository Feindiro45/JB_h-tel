<?php

/** Sauvegarde MySQL/MariaDB et restauration de contrôle dans une base vide dédiée. */
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

require __DIR__.'/../backend/vendor/autoload.php';
$app = require __DIR__.'/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

try {
    $connection = config('database.connections.mysql');
    if (! is_array($connection) || ! empty($connection['url'])) {
        throw new RuntimeException('Utilisez les paramètres DB_* séparés pour la sauvegarde.');
    }
    $source = (string) $connection['database'];
    $target = 'jb_hotel_restore_test';
    if ($source === '' || $source === $target) {
        throw new RuntimeException('Base source invalide.');
    }
    $windows = PHP_OS_FAMILY === 'Windows';
    $dump = getenv('DB_DUMP_BINARY') ?: ($windows ? 'C:/xampp/mysql/bin/mysqldump.exe' : 'mysqldump');
    $client = getenv('DB_CLIENT_BINARY') ?: ($windows ? 'C:/xampp/mysql/bin/mysql.exe' : 'mysql');
    $directory = __DIR__.'/../backups';
    if (! is_dir($directory) && ! mkdir($directory, 0700, true)) {
        throw new RuntimeException('Impossible de créer le dossier de sauvegarde.');
    }
    $file = $directory.'/jb-hotel-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(3)).'.sql';
    $args = ['--host='.(string) $connection['host'], '--port='.(string) $connection['port'], '--user='.(string) $connection['username'], '--default-character-set=utf8mb4'];
    $env = ['MYSQL_PWD' => (string) $connection['password']];
    $process = new Process(array_merge([$dump], $args, ['--single-transaction', '--quick', '--hex-blob', '--skip-lock-tables', '--result-file='.$file, $source]), null, $env);
    $process->setTimeout(300);
    $process->run();
    if (! $process->isSuccessful() || ! is_file($file) || filesize($file) === 0) {
        throw new RuntimeException('Sauvegarde refusée ou incomplète. Vérifiez les outils MySQL et les droits de connexion.');
    }
    chmod($file, 0600);
    $manifest = ['created_at' => gmdate(DATE_ATOM), 'sha256' => hash_file('sha256', $file), 'restored' => false];
    if (in_array('--verify', $argv, true)) {
        // Aucune restauration dans la base source ; la cible fixe doit être vide.
        $connection['database'] = $target;
        $connection['url'] = null;
        DB::statement('CREATE DATABASE IF NOT EXISTS `jb_hotel_restore_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        config(['database.connections.restore_verification' => $connection]);
        $verification = DB::connection('restore_verification');
        if ($verification->select('SHOW TABLES') !== []) {
            throw new RuntimeException('La base jb_hotel_restore_test contient déjà des tables : restauration refusée. La sauvegarde reste disponible.');
        }
        $input = fopen($file, 'rb');
        if ($input === false) {
            throw new RuntimeException('Sauvegarde illisible.');
        }
        $restore = new Process(array_merge([$client], $args, [$target]), null, $env, $input);
        $restore->setTimeout(300);
        $restore->run();
        fclose($input);
        if (! $restore->isSuccessful()) {
            throw new RuntimeException('Échec de restauration de contrôle. La base source est intacte.');
        }
        $counts = [];
        foreach (DB::select('SHOW TABLES') as $row) {
            $table = (string) array_values((array) $row)[0];
            $expected = DB::table($table)->count();
            $actual = $verification->table($table)->count();
            if ($expected !== $actual) {
                throw new RuntimeException('Les nombres de lignes divergent. Refaire le contrôle hors activité.');
            }
            $counts[$table] = $actual;
        }
        $manifest['restored'] = true;
        $manifest['target'] = $target;
        $manifest['table_counts'] = $counts;
    }
    file_put_contents($file.'.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    echo 'Sauvegarde créée : '.basename($file).PHP_EOL;
    echo $manifest['restored'] ? 'Restauration vérifiée : '.count($manifest['table_counts']).' tables, nombres de lignes identiques.'.PHP_EOL : 'Empreinte SHA-256 enregistrée.'.PHP_EOL;
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, $exception instanceof RuntimeException ? $exception->getMessage().PHP_EOL : 'Échec de sauvegarde ou de restauration : vérifiez la configuration et les droits MySQL.'.PHP_EOL);
    exit(1);
}
