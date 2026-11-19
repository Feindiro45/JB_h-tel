<?php

namespace Tests\Feature\Shared;

use App\Modules\Identity\Models\User;
use App\Shared\Audit\AuditLog;
use App\Shared\Contracts\AuditTrail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use LogicException;
use RuntimeException;
use Tests\TestCase;

class AuditTrailTest extends TestCase
{
    use RefreshDatabase;

    public function test_records_actor_entity_and_states_without_secrets(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        app(AuditTrail::class)->record(
            'reservation.extended',
            'reservation',
            42,
            ['net_fcfa' => 50000],
            ['net_fcfa' => 75000, 'password' => 'ne-doit-pas-apparaître'],
        );

        $log = AuditLog::query()->firstOrFail();
        $this->assertSame($user->id, $log->actor_id);
        $this->assertSame('reservation.extended', $log->action);
        $this->assertSame(42, $log->entity_id);
        $this->assertSame(['net_fcfa' => 50000], $log->before_json);
        $this->assertSame(['net_fcfa' => 75000], $log->after_json);
        $this->assertTrue($log->occurred_at->isToday());
    }

    public function test_audit_entries_cannot_be_modified_or_deleted(): void
    {
        app(AuditTrail::class)->record('user.created', 'user', 1);
        $log = AuditLog::query()->firstOrFail();

        try {
            $log->update(['action' => 'falsifié']);
            $this->fail('La modification aurait dû être refusée.');
        } catch (LogicException) {
        }

        $this->expectException(LogicException::class);
        $log->delete();
    }

    public function test_audit_entry_is_rolled_back_with_its_operation(): void
    {
        try {
            DB::transaction(function (): void {
                app(AuditTrail::class)->record('payment.recorded', 'payment', 7);
                throw new RuntimeException('Échec de l’opération');
            });
        } catch (RuntimeException) {
        }

        $this->assertSame(0, AuditLog::query()->count());
    }
}
