<?php

namespace Tests\Feature\Identity;

use App\Modules\Identity\Events\UserLoggedIn;
use App\Modules\Workstations\Models\Workstation;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/** D-074 : mise en veille du logiciel après un délai sans action, sortie par mot de passe. */
final class StandbyTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    public function test_the_signed_in_user_leaves_standby_with_the_right_password_only(): void
    {
        Event::fake([UserLoggedIn::class]);

        $this->actingAs($this->cashier)->postJson('/api/v1/auth/confirm-password', ['password' => UserFactory::PASSWORD])
            ->assertNoContent();
        $this->actingAs($this->cashier)->postJson('/api/v1/auth/confirm-password', ['password' => 'mauvais'])
            ->assertStatus(422)->assertJsonPath('errors.password.0', 'Mot de passe incorrect.');
        $this->actingAs($this->cashier)->postJson('/api/v1/auth/confirm-password', [])
            ->assertStatus(422)->assertJsonValidationErrors(['password']);

        // Pas de nouvelle connexion : aucune alerte de connexion n'est envoyée.
        Event::assertNotDispatched(UserLoggedIn::class);
    }

    public function test_confirmation_requires_a_session_and_is_rate_limited(): void
    {
        $this->postJson('/api/v1/auth/confirm-password', ['password' => UserFactory::PASSWORD])->assertUnauthorized();

        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->actingAs($this->cashier)->postJson('/api/v1/auth/confirm-password', ['password' => 'mauvais'])->assertStatus(422);
        }
        $this->actingAs($this->cashier)->postJson('/api/v1/auth/confirm-password', ['password' => UserFactory::PASSWORD])
            ->assertStatus(429);
    }

    public function test_the_admin_sets_the_standby_delay_received_by_every_workstation(): void
    {
        $this->actingAs($this->admin)->putJson('/api/v1/settings/security.idle_lock_minutes', ['value' => 5])->assertOk();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/security.idle_lock_minutes', ['value' => 0])
            ->assertStatus(422)->assertJsonValidationErrors(['value']);
        $this->actingAs($this->admin)->putJson('/api/v1/settings/security.idle_lock_minutes', ['value' => 241])
            ->assertStatus(422)->assertJsonValidationErrors(['value']);
        $this->actingAs($this->cashier)->putJson('/api/v1/settings/security.idle_lock_minutes', ['value' => 60])->assertForbidden();

        $token = (string) $this->actingAs($this->cashier)->postJson('/api/v1/workstations/register')->assertCreated()->json('token');
        $this->actingAs($this->cashier)->withHeader(Workstation::HEADER, $token)
            ->postJson('/api/v1/workstations/heartbeat')
            ->assertOk()->assertJsonPath('data.offline_rules.lock_after_minutes', 5);
        $this->assertFalse(DB::table('settings')->where('key', 'offline.lock_after_minutes')->exists());
    }
}
