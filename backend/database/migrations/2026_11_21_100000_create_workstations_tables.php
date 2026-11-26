<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
| Postes de caisse (D-062, décision du 21/11/2026). Chaque navigateur qui se connecte est
| enregistré comme poste, identifié par un jeton secret dont seule l'empreinte SHA-256 est gardée.
| L'administrateur désigne un seul poste principal : chaque désignation est une ligne numérotée
| de `workstation_assignments` (numéro unique et croissant), jamais modifiée ni supprimée. Le
| poste principal courant est celui de la dernière attribution.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workstations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 40)->unique();
            $table->char('token_hash', 64)->unique();
            $table->string('user_agent', 255)->nullable();
            $table->foreignId('registered_by')->constrained('users')->restrictOnDelete();
            $table->dateTime('last_seen_at')->nullable();
            $table->foreignId('last_seen_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->dateTime('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('revocation_reason', 255)->nullable();
            $table->datetimes();
        });

        Schema::create('workstation_assignments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->unsignedInteger('number')->unique();
            $table->foreignId('workstation_id')->constrained('workstations')->restrictOnDelete();
            $table->foreignId('previous_workstation_id')->nullable()->constrained('workstations')->restrictOnDelete();
            $table->string('mode', 10);
            $table->string('reason', 255)->nullable();
            $table->dateTime('previous_last_seen_at')->nullable();
            $table->foreignId('assigned_by')->constrained('users')->restrictOnDelete();
            $table->dateTime('assigned_at');
            $table->datetimes();
        });

        DB::statement("ALTER TABLE workstation_assignments ADD CONSTRAINT chk_workstation_assignments_mode CHECK (mode IN ('FIRST', 'PLANNED', 'FORCED'))");
        DB::statement('ALTER TABLE workstation_assignments ADD CONSTRAINT chk_workstation_assignments_number CHECK (number >= 1)');
    }

    public function down(): void
    {
        Schema::dropIfExists('workstation_assignments');
        Schema::dropIfExists('workstations');
    }
};
