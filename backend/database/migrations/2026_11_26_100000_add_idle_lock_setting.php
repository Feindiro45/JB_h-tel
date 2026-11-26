<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * D-074 (demande de l'utilisateur, 26/11/2026) : le logiciel se met en veille après un délai sans
 * action, en ligne comme hors ligne. `security.idle_lock_minutes` remplace
 * `offline.lock_after_minutes` (verrouillage hors ligne seul) et reprend sa valeur.
 */
return new class extends Migration
{
    public function up(): void
    {
        $previous = DB::table('settings')->where('key', 'offline.lock_after_minutes')->value('value');
        $minutes = is_string($previous) ? json_decode($previous, true) : null;

        DB::table('settings')->insertOrIgnore([
            'key' => 'security.idle_lock_minutes',
            'value' => json_encode(is_int($minutes) && $minutes >= 1 ? $minutes : 15, JSON_THROW_ON_ERROR),
            'description' => 'D-074 : mise en veille du logiciel après ce délai sans action, en ligne comme hors ligne.',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('settings')->where('key', 'offline.lock_after_minutes')->delete();
    }

    public function down(): void
    {
        $current = DB::table('settings')->where('key', 'security.idle_lock_minutes')->value('value');
        DB::table('settings')->insertOrIgnore([
            'key' => 'offline.lock_after_minutes',
            'value' => is_string($current) ? $current : json_encode(15, JSON_THROW_ON_ERROR),
            'description' => 'PROVISOIRE (N-05, D-064) : verrouillage de l’écran après ce délai d’inactivité hors ligne.',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('settings')->where('key', 'security.idle_lock_minutes')->delete();
    }
};
