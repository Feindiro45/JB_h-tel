<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Journal ordonné des changements du serveur (D-069) : chaque écriture des données suivies
 * ajoute une ligne dans la même transaction. Les postes (logiciel Windows et PWA) le lisent avec
 * un curseur pour actualiser leurs données sans tout recharger. Lignes techniques, jamais
 * modifiées ; elles ne contiennent aucune donnée personnelle (type, identifiant public, action).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_changes', function (Blueprint $table): void {
            $table->id();
            $table->string('entity', 40);
            $table->char('entity_uuid', 36)->nullable();
            $table->string('action', 10);
            $table->dateTime('occurred_at');
            $table->index('occurred_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_changes');
    }
};
