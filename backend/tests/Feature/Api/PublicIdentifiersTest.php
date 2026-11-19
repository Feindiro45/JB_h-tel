<?php

namespace Tests\Feature\Api;

use App\Modules\Identity\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * D-026 : toute route et toute réponse utilisent l'UUID public, jamais la clé primaire entière.
 */
class PublicIdentifiersTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->admin = User::factory()->admin()->create();
    }

    public function test_models_receive_an_ordered_uuid_on_creation(): void
    {
        $this->assertTrue(Str::isUuid($this->admin->uuid));
        $this->assertSame('uuid', $this->admin->getRouteKeyName());
    }

    public function test_api_exposes_the_uuid_and_never_the_integer_key(): void
    {
        $response = $this->actingAs($this->admin)->getJson('/api/v1/auth/me')->assertOk();

        $this->assertSame($this->admin->uuid, $response->json('data.id'));
        $this->assertStringNotContainsString('"id":'.$this->admin->id.',', (string) $response->getContent());
    }

    public function test_route_resolves_by_uuid(): void
    {
        $this->actingAs($this->admin)
            ->getJson("/api/v1/users/{$this->admin->uuid}")
            ->assertOk()
            ->assertJsonPath('data.id', $this->admin->uuid);
    }

    public function test_integer_or_malformed_identifier_in_a_route_gives_404(): void
    {
        $this->actingAs($this->admin)
            ->getJson("/api/v1/users/{$this->admin->id}")
            ->assertNotFound()
            ->assertJsonPath('title', 'Élément introuvable');

        $this->actingAs($this->admin)->getJson('/api/v1/users/pas-un-uuid')->assertNotFound();
        $this->actingAs($this->admin)->getJson('/api/v1/users/'.Str::uuid7())->assertNotFound();
    }
}
