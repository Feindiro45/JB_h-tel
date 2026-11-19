<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Journal d'audit (append-only : ni modification ni suppression, garanti par le modèle) et
| paramètres de l'application (plafonds de remise, durée de la demi-journée, politiques provisoires).
| L'historique des réservations (prolongations, annulations, remises) est tracé dans audit_logs.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('action', 120);
            $table->string('entity_type', 120);
            $table->unsignedBigInteger('entity_id');
            $table->json('before_json')->nullable();
            $table->json('after_json')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->dateTime('occurred_at');

            $table->index(['entity_type', 'entity_id']);
            $table->index('action');
            $table->index('occurred_at');
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->string('key', 100)->primary();
            $table->json('value');
            $table->string('description')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->datetimes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
        Schema::dropIfExists('audit_logs');
    }
};
