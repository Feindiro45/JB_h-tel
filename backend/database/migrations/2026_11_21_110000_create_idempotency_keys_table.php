<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Clés d'idempotence (lot 3 de SUIVI_NEW.md) : une écriture rejouée avec la même clé
| `Idempotency-Key` renvoie la réponse déjà enregistrée au lieu de recommencer (double clic,
| réseau instable, future synchronisation hors ligne). La clé est écrite dans la même transaction
| que l'opération ; seules les réponses réussies sont conservées. Clé unique par utilisateur.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->char('idempotency_key', 36);
            $table->string('method', 10);
            $table->string('path', 255);
            $table->char('request_hash', 64);
            $table->unsignedSmallInteger('response_status');
            $table->longText('response_body');
            $table->datetimes();

            $table->unique(['user_id', 'idempotency_key']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};
