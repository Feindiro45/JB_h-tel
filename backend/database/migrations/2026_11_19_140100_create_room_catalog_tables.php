<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
| Module RoomCatalog : types de chambre, chambres individuelles, tarifs versionnés.
|
| - Les tarifs ne sont jamais modifiés de façon destructive : une nouvelle version est ajoutée
|   et la précédente reçoit une date de fin (`effective_to`).
| - La maintenance est un statut courant (09) ; les périodes planifiées dépendent de Q-12.
| - L'occupation n'est PAS stockée : elle est calculée à partir des réservations (fiche 06).
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('room_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('label', 100);
            $table->text('description')->nullable();
            $table->datetimes();
        });

        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->unique();
            $table->foreignId('room_type_id')->constrained('room_types')->restrictOnDelete();
            $table->unsignedSmallInteger('capacity');
            $table->string('maintenance_status', 30)->default('AVAILABLE');
            $table->string('maintenance_note')->nullable();
            $table->text('notes')->nullable();
            $table->datetimes();
        });

        Schema::create('room_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_type_id')->constrained('room_types')->restrictOnDelete();
            $table->string('billing_unit', 20);
            $table->unsignedBigInteger('amount_fcfa');
            $table->dateTime('effective_from');
            $table->dateTime('effective_to')->nullable();
            $table->string('reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->datetimes();

            $table->index(['room_type_id', 'billing_unit', 'effective_from'], 'idx_rates_type_unit_effective');
        });

        DB::statement('ALTER TABLE rooms ADD CONSTRAINT chk_rooms_capacity CHECK (capacity > 0)');
        DB::statement("ALTER TABLE rooms ADD CONSTRAINT chk_rooms_maintenance_status CHECK (maintenance_status IN ('AVAILABLE', 'MAINTENANCE'))");
        DB::statement("ALTER TABLE room_rates ADD CONSTRAINT chk_room_rates_billing_unit CHECK (billing_unit IN ('HALF_DAY', 'DAY'))");
        DB::statement('ALTER TABLE room_rates ADD CONSTRAINT chk_room_rates_period CHECK (effective_to IS NULL OR effective_to > effective_from)');
    }

    public function down(): void
    {
        Schema::dropIfExists('room_rates');
        Schema::dropIfExists('rooms');
        Schema::dropIfExists('room_types');
    }
};
