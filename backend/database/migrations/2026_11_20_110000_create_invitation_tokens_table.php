<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Jetons d'invitation (D-054, D-059) séparés des jetons « mot de passe oublié » : un lien de
| réinitialisation (60 min) ne doit jamais pouvoir servir d'invitation (72 h), et inversement.
| Même structure que password_reset_tokens.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invitation_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->dateTime('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitation_tokens');
    }
};
