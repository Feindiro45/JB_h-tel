<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * D-072 (demande de l'utilisateur, 25/11/2026) : salles de conférence.
 * - `room_types.kind` : nature de la catégorie, chambre (ROOM) ou salle de conférence (CONFERENCE).
 * - `reservation_events` : informations propres à la réservation d'une salle (événement, type
 *   d'occupant, organisation, contact), une ligne par réservation, à la place des occupants.
 * - La catégorie « Salle de conférence » est créée si son code est libre ; ses salles et ses
 *   tarifs restent à saisir par l'administrateur (aucun prix n'est inventé).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('room_types', function (Blueprint $table) {
            $table->string('kind', 20)->default('ROOM')->after('label');
        });
        DB::statement("ALTER TABLE room_types ADD CONSTRAINT chk_room_types_kind CHECK (kind IN ('ROOM', 'CONFERENCE'))");

        Schema::create('reservation_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reservation_id')->unique()->constrained('reservations')->restrictOnDelete();
            $table->string('event_name', 150);
            $table->string('organizer_type', 40);
            $table->string('organizer_type_other', 100)->nullable();
            $table->string('organization_name', 150)->nullable();
            $table->string('contact_name', 150)->nullable();
            $table->string('contact_phone', 30)->nullable();
            $table->datetimes();
        });

        if (! DB::table('room_types')->where('code', 'SALLE_CONFERENCE')->exists()) {
            DB::table('room_types')->insert([
                'uuid' => (string) Str::uuid7(),
                'code' => 'SALLE_CONFERENCE',
                'label' => 'Salle de conférence',
                'kind' => 'CONFERENCE',
                'description' => 'Location de salle pour un événement (réunion, atelier, formation, cérémonie).',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reservation_events');
        // La catégorie créée ici n'est retirée que si aucune salle ne l'utilise.
        $type = DB::table('room_types')->where('code', 'SALLE_CONFERENCE')->first();
        if ($type !== null && ! DB::table('rooms')->where('room_type_id', $type->id)->exists()
            && ! DB::table('room_rates')->where('room_type_id', $type->id)->exists()) {
            DB::table('room_types')->where('id', $type->id)->delete();
        }
        DB::statement('ALTER TABLE room_types DROP CONSTRAINT chk_room_types_kind');
        Schema::table('room_types', function (Blueprint $table) {
            $table->dropColumn('kind');
        });
    }
};
