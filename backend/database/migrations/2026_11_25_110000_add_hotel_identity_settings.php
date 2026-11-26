<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * D-073 (demande de l'utilisateur, 25/11/2026) : informations de l'établissement modifiables dans
 * Paramètres. Les valeurs de départ reprennent celles du serveur (`.env`), sauf la ville : l'hôtel
 * est à Bambari, et non à Bangui. Une valeur déjà présente n'est jamais écrasée.
 */
return new class extends Migration
{
    private const KEYS = ['name', 'address', 'city', 'phone', 'email', 'tax_id', 'trade_register'];

    public function up(): void
    {
        $config = (array) config('jbhotel.hotel');
        $rows = [];
        foreach (self::KEYS as $field) {
            $value = $field === 'city'
                ? 'Bambari, République centrafricaine'
                : (is_string($config[$field] ?? null) && trim($config[$field]) !== '' ? trim($config[$field]) : null);
            if ($field === 'name') {
                $value ??= 'JB Hôtel';
            }
            $rows[] = [
                'key' => "hotel.{$field}",
                'value' => json_encode($value, JSON_THROW_ON_ERROR),
                'description' => 'Informations de l’établissement (D-073)',
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        DB::table('settings')->insertOrIgnore($rows);
    }

    public function down(): void
    {
        DB::table('settings')->whereIn('key', array_map(fn (string $field) => "hotel.{$field}", self::KEYS))->delete();
    }
};
