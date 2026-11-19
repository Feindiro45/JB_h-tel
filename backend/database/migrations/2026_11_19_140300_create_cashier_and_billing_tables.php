<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
| Modules Cashier et Billing.
|
| - Un paiement n'est jamais supprimé : il est annulé (statut, auteur, motif). Un remboursement
|   est une ligne distincte rattachée au paiement, qui reste intact.
| - Chaque paiement porte un numéro de reçu unique.
| - Une facture émise est figée (`snapshot_json`) ; toute correction passe par un avoir
|   (`type = CREDIT_NOTE`, `credited_invoice_id`), sous réserve des règles fiscales (Q-09).
| - `document_sequences` fournit des numéros continus (factures, reçus) attribués sous verrou.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reservation_id')->constrained('reservations')->restrictOnDelete();
            $table->string('receipt_number', 30)->unique();
            $table->unsignedBigInteger('amount_fcfa');
            $table->string('method', 40);
            $table->dateTime('received_at');
            $table->foreignId('cashier_id')->constrained('users')->restrictOnDelete();
            $table->string('status', 30)->default('VALID');
            $table->string('reference', 120)->nullable();
            $table->dateTime('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('cancellation_reason')->nullable();
            $table->datetimes();

            $table->index('received_at');
        });

        Schema::create('refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->constrained('payments')->restrictOnDelete();
            $table->unsignedBigInteger('amount_fcfa');
            $table->string('method', 40)->nullable();
            $table->text('reason');
            $table->foreignId('processed_by')->constrained('users')->restrictOnDelete();
            $table->dateTime('processed_at');
            $table->datetimes();

            $table->index('processed_at');
        });

        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reservation_id')->constrained('reservations')->restrictOnDelete();
            $table->string('type', 20)->default('INVOICE');
            $table->foreignId('credited_invoice_id')->nullable()->constrained('invoices')->restrictOnDelete();
            $table->string('invoice_number', 60)->unique();
            $table->dateTime('issued_at');
            $table->foreignId('issued_by')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('gross_fcfa');
            $table->unsignedBigInteger('discount_fcfa');
            $table->unsignedBigInteger('net_fcfa');
            $table->json('snapshot_json');
            $table->string('status', 30)->default('ISSUED');
            $table->datetimes();

            $table->index('issued_at');
        });

        Schema::create('document_sequences', function (Blueprint $table) {
            $table->string('name', 60)->primary();
            $table->unsignedInteger('last_number')->default(0);
            $table->datetimes();
        });

        $checks = [
            'payments' => [
                'chk_payments_amount' => 'amount_fcfa > 0',
                'chk_payments_status' => "status IN ('VALID', 'CANCELLED')",
            ],
            'refunds' => [
                'chk_refunds_amount' => 'amount_fcfa > 0',
            ],
            'invoices' => [
                'chk_invoices_type' => "type IN ('INVOICE', 'CREDIT_NOTE')",
                'chk_invoices_status' => "status IN ('ISSUED', 'CREDITED')",
                'chk_invoices_net' => 'net_fcfa + discount_fcfa = gross_fcfa',
            ],
        ];
        foreach ($checks as $table => $constraints) {
            foreach ($constraints as $name => $expression) {
                DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expression})");
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('document_sequences');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('refunds');
        Schema::dropIfExists('payments');
    }
};
