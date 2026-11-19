<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
| Module Reservations.
|
| - Prix figé à la confirmation : tarif appliqué (`rate_id`), unité, quantité, prix unitaire,
|   brut, remise, net. Une réservation existante n'est jamais recalculée.
| - `blocked_from` / `blocked_until` : intervalle réellement bloqué, calculé par le service
|   selon la politique des heures manquantes (D-009, provisoire). C'est sur cet intervalle,
|   indexé, que porte la détection des conflits ; `period_is_estimated` signale une période déduite.
| - Quantité entière (Q-04, provisoire) au lieu du NUMERIC(10,2) de 09.
| - Une réservation n'est jamais supprimée : elle est annulée (statut, auteur, motif).
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('room_id')->constrained('rooms')->restrictOnDelete();
            $table->foreignId('rate_id')->nullable()->constrained('room_rates')->restrictOnDelete();

            $table->date('start_date');
            $table->date('end_date');
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->dateTime('blocked_from');
            $table->dateTime('blocked_until');
            $table->boolean('period_is_estimated')->default(false);

            $table->string('billing_unit', 20);
            $table->unsignedInteger('quantity');
            $table->unsignedBigInteger('applied_unit_price_fcfa');
            $table->unsignedBigInteger('gross_fcfa');
            $table->string('discount_type', 20)->nullable();
            $table->decimal('discount_value', 12, 2)->nullable();
            $table->unsignedBigInteger('discount_fcfa')->default(0);
            $table->string('discount_reason')->nullable();
            $table->foreignId('discount_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('net_fcfa');

            $table->string('status', 30);
            $table->text('notes')->nullable();

            $table->dateTime('checked_in_at')->nullable();
            $table->foreignId('checked_in_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->dateTime('checked_out_at')->nullable();
            $table->foreignId('checked_out_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->dateTime('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('cancellation_reason')->nullable();

            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->datetimes();

            $table->index(['room_id', 'blocked_from', 'blocked_until'], 'idx_reservations_room_blocked');
            $table->index(['room_id', 'start_date', 'end_date'], 'idx_reservations_room_dates');
            $table->index('status');
        });

        Schema::create('reservation_occupants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reservation_id')->constrained('reservations')->restrictOnDelete();
            $table->string('name', 160);
            $table->boolean('is_primary')->default(false);
            $table->datetimes();
        });

        $checks = [
            'chk_reservations_dates' => 'end_date >= start_date',
            'chk_reservations_blocked' => 'blocked_until > blocked_from',
            'chk_reservations_billing_unit' => "billing_unit IN ('HALF_DAY', 'DAY')",
            'chk_reservations_quantity' => 'quantity > 0',
            'chk_reservations_status' => "status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')",
            'chk_reservations_discount_type' => "discount_type IS NULL OR discount_type IN ('PERCENT', 'FIXED')",
            'chk_reservations_discount_value' => 'discount_type IS NULL OR discount_value IS NOT NULL',
            'chk_reservations_discount_percent' => "discount_type IS NULL OR discount_type <> 'PERCENT' OR discount_value <= 100",
            'chk_reservations_discount_amount' => 'discount_fcfa <= gross_fcfa',
            'chk_reservations_net' => 'net_fcfa + discount_fcfa = gross_fcfa',
        ];
        foreach ($checks as $name => $expression) {
            DB::statement("ALTER TABLE reservations ADD CONSTRAINT {$name} CHECK ({$expression})");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reservation_occupants');
        Schema::dropIfExists('reservations');
    }
};
