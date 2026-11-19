<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Notifications par e-mail (D-039) : un client qui a donné son e-mail reçoit un message à chaque
| opération sur son séjour ; il peut se désinscrire à tout moment (lien présent dans chaque e-mail).
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->boolean('email_notifications')->default(true)->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('email_notifications');
        });
    }
};
