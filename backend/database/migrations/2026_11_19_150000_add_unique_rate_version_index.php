<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Phase 3 : deux versions d'un même tarif (type, unité) ne peuvent pas commencer au même instant.
| La chaîne sans chevauchement est garantie par RateService ; cet index unique en est le filet de
| sécurité. Il remplace l'index simple de même composition (idx_rates_type_unit_effective).
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('room_rates', function (Blueprint $table) {
            $table->unique(['room_type_id', 'billing_unit', 'effective_from'], 'uniq_rates_version_start');
        });
        Schema::table('room_rates', function (Blueprint $table) {
            $table->dropIndex('idx_rates_type_unit_effective');
        });
    }

    public function down(): void
    {
        Schema::table('room_rates', function (Blueprint $table) {
            $table->index(['room_type_id', 'billing_unit', 'effective_from'], 'idx_rates_type_unit_effective');
        });
        Schema::table('room_rates', function (Blueprint $table) {
            $table->dropUnique('uniq_rates_version_start');
        });
    }
};
