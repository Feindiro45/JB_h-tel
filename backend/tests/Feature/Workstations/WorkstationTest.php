<?php

namespace Tests\Feature\Workstations;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Models\User;
use App\Modules\Workstations\Models\Workstation;
use App\Modules\Workstations\Models\WorkstationAssignment;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * Postes de caisse et poste principal unique (D-062) : enregistrement par jeton, désignation
 * numérotée (première, planifiée, forcée), révocation et blocage des écritures hors du poste
 * principal quand l'administrateur l'active.
 */
class WorkstationTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** @return array{id: string, token: string} */
    private function register(?User $as = null): array
    {
        $response = $this->actingAs($as ?? $this->cashier)
            ->withHeader('User-Agent', 'Mozilla/5.0 Test')
            ->postJson('/api/v1/workstations/register')
            ->assertCreated();

        return ['id' => (string) $response->json('data.id'), 'token' => (string) $response->json('token')];
    }

    /** Active la règle par l'écran Paramètres (catalogue, validation booléenne, audit). */
    private function enforce(bool $on = true): void
    {
        $this->actingAs($this->admin)->putJson('/api/v1/settings/workstations.enforce_main_post', ['value' => $on])
            ->assertOk()->assertJsonPath('data.value', $on);
    }

    public function test_a_browser_registers_once_and_only_the_token_hash_is_stored(): void
    {
        $post = $this->register();

        $this->assertSame(48, strlen($post['token']));
        $stored = Workstation::query()->where('uuid', $post['id'])->firstOrFail();
        $this->assertSame(hash('sha256', $post['token']), $stored->token_hash);
        $this->assertSame("Poste {$stored->id}", $stored->name);
        $this->assertSame('Mozilla/5.0 Test', $stored->user_agent);
        $this->assertSame(1, AuditLog::query()->where('action', 'workstation.registered')->count());

        $this->travel(2)->minutes();
        $this->actingAs($this->admin)->withHeader(Workstation::HEADER, $post['token'])
            ->postJson('/api/v1/workstations/heartbeat')
            ->assertOk()
            ->assertJsonPath('data.id', $post['id'])
            ->assertJsonPath('data.is_main', false)
            ->assertJsonPath('data.main', null)
            ->assertJsonPath('data.enforce_main_post', false)
            ->assertJsonMissingPath('data.token_hash');
        $stored->refresh();
        $this->assertSame($this->admin->id, $stored->last_seen_by);
        $this->assertTrue($stored->last_seen_at->eq(now()));

        $this->actingAs($this->cashier)->withHeader(Workstation::HEADER, 'jeton-inconnu')
            ->postJson('/api/v1/workstations/heartbeat')
            ->assertNotFound()->assertJsonPath('code', 'workstation_unknown');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/workstations/register')->assertUnauthorized();
    }

    public function test_only_the_administrator_manages_workstations(): void
    {
        $post = $this->register();

        $this->actingAs($this->cashier)->getJson('/api/v1/workstations')->assertForbidden();
        $this->actingAs($this->cashier)->postJson("/api/v1/workstations/{$post['id']}/designate")->assertForbidden();
        $this->assertContains(PermissionName::WorkstationsManage, PermissionName::adminOnly());

        $this->actingAs($this->admin)->withHeader(Workstation::HEADER, $post['token'])
            ->getJson('/api/v1/workstations')
            ->assertOk()
            ->assertJsonPath('data.main', null)
            ->assertJsonPath('data.settings.enforce_main_post', false)
            ->assertJsonPath('data.settings.silent_after_minutes', 5)
            ->assertJsonPath('data.workstations.0.id', $post['id'])
            ->assertJsonPath('data.workstations.0.is_current', true)
            ->assertJsonPath('data.workstations.0.registered_by', $this->cashier->name)
            ->assertJsonMissingPath('data.workstations.0.token_hash');
    }

    public function test_rename_requires_a_unique_readable_name(): void
    {
        $first = $this->register();
        $second = $this->register();

        $this->actingAs($this->admin)->patchJson("/api/v1/workstations/{$first['id']}", ['name' => 'CAISSE-01'])
            ->assertOk()->assertJsonPath('data.workstations.0.name', 'CAISSE-01');
        $this->actingAs($this->admin)->patchJson("/api/v1/workstations/{$second['id']}", ['name' => 'CAISSE-01'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->actingAs($this->admin)->patchJson("/api/v1/workstations/{$second['id']}", ['name' => '<script>'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->assertSame(1, AuditLog::query()->where('action', 'workstation.renamed')->count());
    }

    public function test_designations_are_numbered_planned_while_the_main_post_answers_and_forced_after_silence(): void
    {
        $caisse = $this->register();
        $bureau = $this->register($this->admin);
        $reserve = $this->register($this->admin);

        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$caisse['id']}/designate")
            ->assertOk()
            ->assertJsonPath('data.main.id', $caisse['id'])
            ->assertJsonPath('data.main.assignment_number', 1)
            ->assertJsonPath('data.assignments.0.mode', 'FIRST');
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$caisse['id']}/designate")
            ->assertStatus(409)->assertJsonPath('code', 'workstation_already_main');

        // L'ancien poste a donné signe de vie il y a moins de 5 minutes : transfert planifié.
        $this->travel(3)->minutes();
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$bureau['id']}/designate", ['reason' => 'Nouveau PC'])
            ->assertOk()
            ->assertJsonPath('data.main.assignment_number', 2)
            ->assertJsonPath('data.assignments.0.mode', 'PLANNED')
            ->assertJsonPath('data.assignments.0.previous_workstation', Workstation::query()->where('uuid', $caisse['id'])->value('name'));

        // Le poste principal se tait depuis plus de 5 minutes : transfert forcé, confirmé et motivé.
        $this->travel(10)->minutes();
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$reserve['id']}/designate")
            ->assertStatus(409)
            ->assertJsonPath('code', 'workstation_transfer_needs_force')
            ->assertJsonPath('details.0', 'Poste principal actuel : « '.Workstation::query()->where('uuid', $bureau['id'])->value('name').' »');
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$reserve['id']}/designate", ['force' => true, 'reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'workstation_transfer_needs_force');
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$reserve['id']}/designate", ['force' => true, 'reason' => 'PC de caisse en panne'])
            ->assertOk()
            ->assertJsonPath('data.main.assignment_number', 3)
            ->assertJsonPath('data.assignments.0.mode', 'FORCED')
            ->assertJsonPath('data.assignments.0.reason', 'PC de caisse en panne');

        $this->assertSame([1, 2, 3], WorkstationAssignment::query()->orderBy('number')->pluck('number')->all());
        $this->assertSame(3, AuditLog::query()->where('action', 'workstation.designated')->count());
        $this->expectException(\LogicException::class);
        WorkstationAssignment::query()->firstOrFail()->delete();
    }

    public function test_the_main_post_cannot_be_revoked_and_a_revoked_post_cannot_be_designated(): void
    {
        $caisse = $this->register();
        $ancien = $this->register();
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$caisse['id']}/designate")->assertOk();

        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$caisse['id']}/revoke", ['reason' => 'Test'])
            ->assertStatus(409)->assertJsonPath('code', 'workstation_is_main');
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$ancien['id']}/revoke", [])
            ->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$ancien['id']}/revoke", ['reason' => 'PC vendu'])
            ->assertOk()->assertJsonPath('data.workstations.1.revocation_reason', 'PC vendu');
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$ancien['id']}/designate")
            ->assertStatus(409)->assertJsonPath('code', 'workstation_revoked');

        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$ancien['id']}/reactivate")->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$ancien['id']}/reactivate")
            ->assertStatus(409)->assertJsonPath('code', 'workstation_not_revoked');
        $this->assertSame(1, AuditLog::query()->where('action', 'workstation.revoked')->count());
        $this->assertSame(1, AuditLog::query()->where('action', 'workstation.reactivated')->count());
    }

    public function test_writes_are_reserved_to_the_main_post_only_once_the_administrator_enables_it(): void
    {
        $reservation = $this->bookOk();
        $caisse = $this->register();
        $bureau = $this->register($this->admin);
        // Les en-têtes d'un test persistent d'une requête à l'autre : vidés avant chaque appel.
        $pay = fn (?string $token) => $this->flushHeaders()->actingAs($this->cashier)
            ->withHeaders($token === null ? [] : [Workstation::HEADER => $token])
            ->postJson("/api/v1/reservations/{$reservation}/payments", ['amount_fcfa' => 1000, 'method' => 'CASH']);

        // Règle active sans poste principal désigné : aucun effet.
        $this->enforce();
        $pay(null)->assertCreated();

        $this->actingAs($this->admin)->postJson("/api/v1/workstations/{$caisse['id']}/designate")->assertOk();
        $pay(null)->assertForbidden()->assertJsonPath('code', 'workstation_not_main');
        $pay($bureau['token'])->assertForbidden()
            ->assertJsonPath('code', 'workstation_not_main')
            ->assertJsonPath('details.1', 'Ce poste : « '.Workstation::query()->where('uuid', $bureau['id'])->value('name').' »');
        $pay($caisse['token'])->assertCreated();
        $this->flushHeaders()->book([], $this->cashier)->assertForbidden()->assertJsonPath('code', 'workstation_not_main');

        // Consultation et devis restent possibles depuis tout poste.
        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$reservation}")->assertOk();
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations/quote', $this->payload())->assertOk();

        // Règle désactivée : retour au fonctionnement habituel.
        $this->enforce(false);
        $pay($bureau['token'])->assertCreated();
    }
}
