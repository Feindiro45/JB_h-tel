<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/*
| Identifiants publics (D-026) : chaque entité exposée par l'API ou dans une URL reçoit un UUID
| unique. La clé primaire entière reste interne et n'est jamais exposée.
| Les lignes existantes reçoivent un UUID avant que la colonne devienne obligatoire.
*/
return new class extends Migration
{
    /** @var list<string> */
    private const TABLES = [
        'users',
        'customers',
        'room_types',
        'rooms',
        'room_rates',
        'reservations',
        'reservation_occupants',
        'payments',
        'refunds',
        'invoices',
        'audit_logs',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->uuid('uuid')->nullable()->after('id');
            });

            DB::table($table)->whereNull('uuid')->orderBy('id')->select('id')
                ->each(fn (object $row) => DB::table($table)->where('id', $row->id)->update(['uuid' => (string) Str::uuid7()]));

            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                $blueprint->uuid('uuid')->nullable(false)->change();
                $blueprint->unique('uuid', "uniq_{$table}_uuid");
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                $blueprint->dropUnique("uniq_{$table}_uuid");
                $blueprint->dropColumn('uuid');
            });
        }
    }
};
