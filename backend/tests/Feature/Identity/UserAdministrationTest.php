<?php

namespace Tests\Feature\Identity;

use App\Modules\Identity\Models\User;
use App\Shared\Audit\AuditLog;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class UserAdministrationTest extends TestCase
{
    public function test_a_delegated_user_manager_cannot_promote_themselves_or_create_an_administrator(): void
    {
        $cashier = User::factory()->cashier()->create();
        Role::findByName('caissiere', 'web')->givePermissionTo(['users.view', 'users.manage']);
        $this->actingAs($cashier)->patchJson('/api/v1/users/'.$cashier->uuid, ['role' => 'admin'])
            ->assertStatus(403)->assertJsonPath('code', 'admin_role_required');
        $this->actingAs($cashier)->postJson('/api/v1/users', [
            'name' => 'Compte refusé', 'email' => 'forbidden@exemple.cf', 'role' => 'admin',
        ])->assertStatus(403)->assertJsonPath('code', 'admin_role_required');
        $this->assertDatabaseMissing('users', ['email' => 'forbidden@exemple.cf']);
        $this->assertFalse($cashier->fresh()->isAdmin());
    }

    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->admin = User::factory()->admin()->create(['name' => 'Admin Principal']);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function newCashierPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Grâce Nzapayéké',
            'email' => 'Grace@JBHotel.local',
            'password' => 'Caisse2026ok',
            'password_confirmation' => 'Caisse2026ok',
            'role' => 'caissiere',
        ], $overrides);
    }

    public function test_admin_lists_users_with_search_and_role_filter(): void
    {
        User::factory()->cashier()->create(['name' => 'Awa Caissière']);
        User::factory()->cashier()->create(['name' => 'Bruno Caissier']);

        $this->actingAs($this->admin)
            ->getJson('/api/v1/users?role=caissiere&search=Awa')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Awa Caissière')
            ->assertJsonPath('meta.total', 1);
    }

    public function test_cashier_cannot_manage_users(): void
    {
        $cashier = User::factory()->cashier()->create();

        $this->actingAs($cashier)->getJson('/api/v1/users')
            ->assertStatus(403)
            ->assertJsonPath('title', 'Accès refusé');
        $this->actingAs($cashier)->postJson('/api/v1/users', $this->newCashierPayload())
            ->assertStatus(403);
        $this->actingAs($cashier)->patchJson("/api/v1/users/{$this->admin->uuid}", ['active' => false])
            ->assertStatus(403);
    }

    public function test_user_can_view_their_own_profile_but_not_others(): void
    {
        $cashier = User::factory()->cashier()->create();

        $this->actingAs($cashier)->getJson("/api/v1/users/{$cashier->uuid}")->assertOk();
        $this->actingAs($cashier)->getJson("/api/v1/users/{$this->admin->uuid}")->assertStatus(403);
    }

    public function test_admin_creates_a_cashier_with_hashed_password_role_and_audit(): void
    {
        $response = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', $this->newCashierPayload())
            ->assertCreated()
            ->assertJsonPath('data.email', 'grace@jbhotel.local')
            ->assertJsonPath('data.role', 'caissiere')
            ->assertJsonPath('data.active', true);

        $user = User::query()->where('uuid', $response->json('data.id'))->firstOrFail();
        $this->assertTrue(Hash::check('Caisse2026ok', $user->password));

        $audit = AuditLog::query()->where('action', 'user.created')->firstOrFail();
        $this->assertSame($this->admin->id, $audit->actor_id);
        $this->assertSame('caissiere', $audit->after_json['role'] ?? null);
        $this->assertArrayNotHasKey('password', $audit->after_json ?? []);
    }

    public function test_new_cashiers_share_the_same_role_permissions_including_reservation_creation(): void
    {
        $permissions = [];
        foreach (['awa@jbhotel.local', 'bruno@jbhotel.local'] as $email) {
            $response = $this->actingAs($this->admin)
                ->postJson('/api/v1/users', $this->newCashierPayload(['email' => $email]))
                ->assertCreated()
                ->assertJsonPath('data.role', 'caissiere');
            $permissions[] = $response->json('data.permissions');
        }

        $this->assertSame($permissions[0], $permissions[1]);
        $this->assertContains('reservations.create', $permissions[0]);
        $this->assertNotContains('roles.manage', $permissions[0]);

        // La modification du rôle est commune aux comptes existants et aux futurs comptes.
        Role::findByName('caissiere', 'web')->revokePermissionTo('discounts.apply');
        $third = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', $this->newCashierPayload(['email' => 'claire@jbhotel.local']))
            ->assertCreated();
        $this->assertNotContains('discounts.apply', $third->json('data.permissions'));
        foreach (['awa@jbhotel.local', 'bruno@jbhotel.local'] as $email) {
            $cashier = User::query()->where('email', $email)->firstOrFail();
            $this->actingAs($cashier)->getJson('/api/v1/auth/me')
                ->assertOk()->assertJsonPath('data.permissions', $third->json('data.permissions'));
        }
    }

    public function test_user_creation_validation_messages_are_in_french(): void
    {
        User::factory()->cashier()->create(['email' => 'grace@jbhotel.local']);

        $this->actingAs($this->admin)
            ->postJson('/api/v1/users', $this->newCashierPayload([
                'email' => 'grace@jbhotel.local',
                'password' => 'Caisse2026ok',
                'password_confirmation' => 'autre',
                'role' => 'directeur',
            ]))
            ->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'La valeur du champ adresse e-mail est déjà utilisée.')
            ->assertJsonPath('errors.password.0', 'Le champ de confirmation mot de passe ne correspond pas.')
            ->assertJsonValidationErrors(['role']);
    }

    public function test_admin_updates_and_deactivates_a_user_with_audit_trail(): void
    {
        $cashier = User::factory()->cashier()->create(['name' => 'Awa']);

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/users/{$cashier->uuid}", ['name' => 'Awa Ndémanga', 'active' => false])
            ->assertOk()
            ->assertJsonPath('data.name', 'Awa Ndémanga')
            ->assertJsonPath('data.active', false);

        $audit = AuditLog::query()->where('action', 'user.updated')->firstOrFail();
        $this->assertSame('Awa', $audit->before_json['name'] ?? null);
        $this->assertTrue($audit->before_json['active'] ?? null);
        $this->assertSame('Awa Ndémanga', $audit->after_json['name'] ?? null);
        $this->assertFalse($audit->after_json['active'] ?? null);
    }

    public function test_password_change_is_audited_without_the_password(): void
    {
        $cashier = User::factory()->cashier()->create();

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/users/{$cashier->uuid}", [
                'password' => 'Nouveau2026ok',
                'password_confirmation' => 'Nouveau2026ok',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('Nouveau2026ok', $cashier->refresh()->password));
        $audit = AuditLog::query()->where('action', 'user.updated')->firstOrFail();
        $this->assertTrue($audit->after_json['password_changed'] ?? false);
        $this->assertStringNotContainsString('Nouveau2026ok', (string) json_encode($audit->after_json));
    }

    public function test_admin_can_promote_a_cashier(): void
    {
        $cashier = User::factory()->cashier()->create();

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/users/{$cashier->uuid}", ['role' => 'admin'])
            ->assertOk()
            ->assertJsonPath('data.role', 'admin');

        $this->assertTrue($cashier->refresh()->isAdmin());
    }

    public function test_admin_cannot_lock_themselves_out(): void
    {
        User::factory()->admin()->create();

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/users/{$this->admin->uuid}", ['active' => false])
            ->assertStatus(409)
            ->assertJsonPath('code', 'self_lockout');

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/users/{$this->admin->uuid}", ['role' => 'caissiere'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'self_lockout');

        $this->assertTrue($this->admin->refresh()->active);
    }

    public function test_an_admin_can_be_deactivated_when_another_active_admin_remains(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/users/{$otherAdmin->uuid}", ['active' => false])
            ->assertOk()
            ->assertJsonPath('data.active', false);
    }

    public function test_the_last_active_admin_cannot_be_deactivated_or_demoted(): void
    {
        // Une caissière à qui l'administrateur a délégué la gestion des utilisateurs.
        Role::findByName('caissiere', 'web')->givePermissionTo(['users.view', 'users.manage']);
        $delegate = User::factory()->cashier()->create();
        // Un administrateur inactif ne compte pas.
        User::factory()->admin()->inactive()->create();

        $this->actingAs($delegate)
            ->patchJson("/api/v1/users/{$this->admin->uuid}", ['active' => false])
            ->assertStatus(403)
            ->assertJsonPath('code', 'admin_role_required');

        $this->actingAs($delegate)
            ->patchJson("/api/v1/users/{$this->admin->uuid}", ['role' => 'caissiere'])
            ->assertStatus(403)
            ->assertJsonPath('code', 'admin_role_required');

        $this->admin->refresh();
        $this->assertTrue($this->admin->active);
        $this->assertTrue($this->admin->isAdmin());
    }
}
