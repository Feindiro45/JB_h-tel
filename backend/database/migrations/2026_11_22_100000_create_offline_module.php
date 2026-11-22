<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\PermissionRegistrar;

/*
| Module administrateur « Mode hors ligne » (lot 4A, D-064) :
| - état déclaré par chaque poste avec son signal de présence (opérations en attente, refus,
|   dernière synchronisation, dernière sauvegarde, stockage protégé) ;
| - journal des opérations faites hors ligne et reçues par le serveur (acceptées, doublons,
|   refusées avec leur cause), que l'administrateur examine ;
| - droit `offline.manage` (administrateur seul) et règles hors ligne provisoires.
*/
return new class extends Migration
{
    private const SETTINGS = [
        'offline.allowed_operations' => [
            'value' => [
                'payment.record', 'reservation.create', 'customer.create', 'reservation.confirm',
                'reservation.check-in', 'reservation.check-out', 'reservation.extend',
                'reservation.cancel', 'reservation.modify', 'reservation.occupants', 'invoice.issue',
            ],
            'description' => 'PROVISOIRE (N-02, D-064) : opérations permises sans Internet, toutes par défaut.',
        ],
        'offline.lock_after_minutes' => [
            'value' => 15,
            'description' => 'PROVISOIRE (N-05, D-064) : verrouillage de l’écran après ce délai d’inactivité hors ligne.',
        ],
        'offline.backup_reminder_minutes' => [
            'value' => 60,
            'description' => 'PROVISOIRE (N-06, D-064) : rappel d’exporter une sauvegarde quand une opération attend depuis ce délai.',
        ],
        'offline.provisional_prefix' => [
            'value' => 'LOC',
            'description' => 'PROVISOIRE (N-03, D-064) : préfixe des numéros provisoires (LOC-<poste>-<séquence>).',
        ],
    ];

    public function up(): void
    {
        Schema::table('workstations', function (Blueprint $table): void {
            $table->unsignedInteger('pending_operations')->default(0)->after('last_seen_by');
            $table->unsignedInteger('rejected_operations')->default(0)->after('pending_operations');
            $table->dateTime('oldest_pending_at')->nullable()->after('rejected_operations');
            $table->dateTime('last_sync_at')->nullable()->after('oldest_pending_at');
            $table->string('last_sync_status', 20)->nullable()->after('last_sync_at');
            $table->dateTime('last_backup_at')->nullable()->after('last_sync_status');
            $table->boolean('storage_persisted')->nullable()->after('last_backup_at');
            $table->dateTime('reported_at')->nullable()->after('storage_persisted');
        });

        Schema::create('offline_operations', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->uuid('idempotency_key');
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('workstation_id')->nullable()->constrained('workstations')->restrictOnDelete();
            $table->string('kind', 40);
            $table->string('label', 255);
            $table->string('method', 10);
            $table->string('path', 255);
            $table->dateTime('created_offline_at')->nullable();
            $table->dateTime('received_at');
            $table->unsignedInteger('attempts')->default(1);
            $table->string('outcome', 20);
            $table->unsignedSmallInteger('http_status');
            $table->string('reason_title', 160)->nullable();
            $table->text('reason')->nullable();
            $table->string('reason_code', 80)->nullable();
            $table->string('review_status', 20)->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->string('review_reason', 255)->nullable();
            $table->datetimes();

            $table->unique(['user_id', 'idempotency_key']);
            $table->index(['outcome', 'received_at']);
            $table->index(['review_status', 'received_at']);
        });
        DB::statement("ALTER TABLE offline_operations ADD CONSTRAINT chk_offline_operations_outcome CHECK (outcome IN ('ACCEPTED','DUPLICATE','REJECTED'))");
        DB::statement("ALTER TABLE offline_operations ADD CONSTRAINT chk_offline_operations_review CHECK (review_status IS NULL OR review_status IN ('TO_REVIEW','REENTERED','REJECTED'))");

        $now = now();
        $permission = DB::table('permissions')->where(['name' => 'offline.manage', 'guard_name' => 'web'])->value('id')
            ?? DB::table('permissions')->insertGetId(['name' => 'offline.manage', 'guard_name' => 'web', 'created_at' => $now, 'updated_at' => $now]);
        $admin = DB::table('roles')->where(['name' => 'admin', 'guard_name' => 'web'])->value('id');
        if ($admin !== null) {
            DB::table('role_has_permissions')->insertOrIgnore(['permission_id' => $permission, 'role_id' => $admin]);
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (self::SETTINGS as $key => $setting) {
            DB::table('settings')->insertOrIgnore([
                'key' => $key,
                'value' => json_encode($setting['value'], JSON_THROW_ON_ERROR),
                'description' => $setting['description'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('settings')->whereIn('key', array_keys(self::SETTINGS))->delete();
        $permission = DB::table('permissions')->where(['name' => 'offline.manage', 'guard_name' => 'web'])->value('id');
        if ($permission !== null) {
            DB::table('role_has_permissions')->where('permission_id', $permission)->delete();
            DB::table('model_has_permissions')->where('permission_id', $permission)->delete();
            DB::table('permissions')->where('id', $permission)->delete();
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Schema::dropIfExists('offline_operations');
        Schema::table('workstations', function (Blueprint $table): void {
            $table->dropColumn([
                'pending_operations', 'rejected_operations', 'oldest_pending_at', 'last_sync_at',
                'last_sync_status', 'last_backup_at', 'storage_persisted', 'reported_at',
            ]);
        });
    }
};
