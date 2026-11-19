<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/*
| Vérification publique des factures (D-036) : chaque facture ou avoir reçoit, à l'émission, un
| code aléatoire imprimé dans son QR code. La page publique exige l'UUID ET ce code : impossible
| de parcourir les factures ou de valider une facture contrefaite. Le code est stocké (et non
| dérivé de la clé de l'application) pour rester valable si cette clé change.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('verification_code', 32)->nullable()->after('invoice_number');
        });

        DB::table('invoices')->whereNull('verification_code')->orderBy('id')->select('id')
            ->each(fn (object $row) => DB::table('invoices')->where('id', $row->id)->update(['verification_code' => Str::random(24)]));

        Schema::table('invoices', function (Blueprint $table) {
            $table->string('verification_code', 32)->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn('verification_code');
        });
    }
};
