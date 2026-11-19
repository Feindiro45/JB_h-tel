<?php

namespace Tests\Feature\Identity;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\Models\User;
use App\Shared\Audit\AuditLog;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class RolePermissionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->admin = User::factory()->admin()->create();
    }

    public function test_seeded_roles_match_the_catalogue(): void
    {
        $admin = Role::findByName('admin', 'web');
        $cashier = Role::findByName('caissiere', 'web');

        $this->assertCount(count(PermissionName::cases()), $admin->permissions);
        $this->assertEqualsCanonicalizing(
            array_map(fn (PermissionName $p) => $p->value, RoleName::Cashier->defaultPermissions()),
            $cashier->permissions->pluck('name')->all(),
        );
        // Critère d'acceptation (fiche 06) : la caissière ne peut pas modifier un tarif par défaut.
        $this->assertFalse($cashier->hasPermissionTo(PermissionName::RatesManage->value, 'web'));
    }

    public function test_seeder_keeps_permissions_customised_by_the_admin(): void
    {
        Role::findByName('caissiere', 'web')->givePermissionTo(PermissionName::ReportsExport->value);

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->assertTrue(Role::findByName('caissiere', 'web')->hasPermissionTo(PermissionName::ReportsExport->value, 'web'));
    }

    public function test_admin_lists_roles_and_the_permission_catalogue(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/v1/roles')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'admin')
            ->assertJsonPath('data.0.editable', false)
            ->assertJsonPath('data.1.name', 'caissiere')
            ->assertJsonPath('data.1.label', 'Caissière');

        $this->actingAs($this->admin)
            ->getJson('/api/v1/permissions')
            ->assertOk()
            ->assertJsonFragment(['name' => 'rates.manage', 'label' => 'Modifier les tarifs']);
    }

    public function test_admin_updates_cashier_permissions_with_audit(): void
    {
        $cashier = User::factory()->cashier()->create();
        $this->assertFalse($cashier->hasPermissionTo(PermissionName::RatesManage->value));

        $this->actingAs($this->admin)
            ->putJson('/api/v1/roles/caissiere/permissions', [
                'permissions' => ['reservations.view', 'rates.view', 'rates.manage'],
            ])
            ->assertOk()
            ->assertJsonPath('data.permissions', ['rates.manage', 'rates.view', 'reservations.view']);

        $this->assertTrue($cashier->refresh()->hasPermissionTo(PermissionName::RatesManage->value));
        $this->assertFalse($cashier->hasPermissionTo(PermissionName::PaymentsRecord->value));

        $audit = AuditLog::query()->where('action', 'role.permissions_updated')->firstOrFail();
        $this->assertContains('payments.record', $audit->before_json['permissions'] ?? []);
        $this->assertNotContains('payments.record', $audit->after_json['permissions'] ?? []);
    }

    public function test_admin_role_is_locked(): void
    {
        $this->actingAs($this->admin)
            ->putJson('/api/v1/roles/admin/permissions', ['permissions' => []])
            ->assertStatus(409)
            ->assertJsonPath('code', 'admin_role_locked');

        $this->assertCount(count(PermissionName::cases()), Role::findByName('admin', 'web')->permissions);
    }

    public function test_unknown_permission_is_rejected(): void
    {
        $this->actingAs($this->admin)
            ->putJson('/api/v1/roles/caissiere/permissions', ['permissions' => ['tout.faire']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['permissions.0']);
    }

    public function test_cashier_cannot_manage_roles(): void
    {
        $cashier = User::factory()->cashier()->create();

        $this->actingAs($cashier)->getJson('/api/v1/roles')->assertStatus(403);
        $this->actingAs($cashier)
            ->putJson('/api/v1/roles/caissiere/permissions', ['permissions' => ['rates.manage']])
            ->assertStatus(403)
            ->assertJsonPath('title', 'Accès refusé');
    }
}
