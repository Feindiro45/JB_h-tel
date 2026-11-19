<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
| Prolongations d'un séjour (D-053, demande du 19/11/2026) : chaque prolongation est conservée avec
| la période ajoutée, la quantité, le prix unitaire figé et l'auteur. La facture détaille ainsi le
| séjour initial et chaque prolongation ; la réservation garde ses totaux (quantité, brut, net).
| Lignes jamais modifiées ni supprimées (clés étrangères en RESTRICT).
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reservation_extensions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reservation_id')->constrained('reservations')->restrictOnDelete();

            $table->date('previous_end_date');
            $table->time('previous_end_time')->nullable();
            $table->dateTime('previous_blocked_until');
            $table->date('end_date');
            $table->time('end_time')->nullable();
            $table->dateTime('blocked_until');

            $table->unsignedInteger('added_quantity');
            $table->unsignedBigInteger('unit_price_fcfa');
            $table->unsignedBigInteger('amount_fcfa');
            $table->unsignedBigInteger('previous_net_fcfa');
            $table->unsignedBigInteger('net_fcfa');

            $table->foreignId('extended_by')->constrained('users')->restrictOnDelete();
            $table->dateTime('extended_at');
            $table->datetimes();

            $table->index(['reservation_id', 'id']);
        });

        $checks = [
            'chk_reservation_extensions_period' => 'blocked_until > previous_blocked_until',
            'chk_reservation_extensions_dates' => 'end_date >= previous_end_date',
            'chk_reservation_extensions_amount' => 'amount_fcfa = added_quantity * unit_price_fcfa',
        ];
        foreach ($checks as $name => $expression) {
            DB::statement("ALTER TABLE reservation_extensions ADD CONSTRAINT {$name} CHECK ({$expression})");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reservation_extensions');
    }
};
