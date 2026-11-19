<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Fiche client détaillée (Décisions V6). Collecte minimale : seuls le nom (et le téléphone,
| contrôlé côté application, Q-10 provisoire) sont exigés.
| Colonnes alignées sur docs/09_schema_reference.sql : `name` = nom, `first_name` = prénoms.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 160);
            $table->string('first_name', 160)->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('email')->nullable();
            $table->string('origin_city', 160)->nullable();
            $table->string('origin_country', 160)->nullable();
            $table->string('address')->nullable();
            $table->string('identification_type', 60)->nullable();
            $table->string('identification_number', 100)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->datetimes();

            $table->index('name');
            $table->index('phone');
            $table->index(['identification_type', 'identification_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
