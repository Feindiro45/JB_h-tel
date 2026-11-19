<?php

namespace Tests\Feature\Identity;

use App\Modules\Identity\Models\User;
use App\Shared\Audit\AuditLog;
use Database\Factories\UserFactory;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    /** En-têtes d'une requête venant du frontend : Sanctum ouvre alors une session (mode SPA). */
    private const FRONTEND = ['Origin' => 'http://localhost:5173', 'Referer' => 'http://localhost:5173/'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    /** @return TestResponse<Response> */
    private function login(string $email, string $password = UserFactory::PASSWORD): TestResponse
    {
        return $this->withHeaders(self::FRONTEND)
            ->postJson('/api/v1/auth/login', ['email' => $email, 'password' => $password]);
    }

    public function test_cashier_logs_in_from_the_frontend_and_gets_role_and_permissions(): void
    {
        $user = User::factory()->cashier()->create(['email' => 'awa@jbhotel.local']);

        $this->login('awa@jbhotel.local')
            ->assertOk()
            ->assertJsonPath('data.email', 'awa@jbhotel.local')
            ->assertJsonPath('data.role', 'caissiere')
            ->assertJsonPath('data.role_label', 'Caissière')
            ->assertJsonFragment(['reservations.create'])
            ->assertJsonMissing(['rates.manage']);

        $this->assertAuthenticatedAs($user, 'web');
        $this->assertNotNull($user->refresh()->last_login_at);
    }

    public function test_wrong_password_is_rejected_with_a_french_message(): void
    {
        User::factory()->cashier()->create(['email' => 'awa@jbhotel.local']);

        $this->login('awa@jbhotel.local', 'mauvais-mot-de-passe')
            ->assertStatus(422)
            ->assertJsonPath('title', 'Données invalides')
            ->assertJsonPath('errors.email.0', 'Ces identifiants ne correspondent pas à nos enregistrements.');

        $this->assertGuest('web');
    }

    public function test_login_is_throttled_after_five_failed_attempts(): void
    {
        User::factory()->cashier()->create(['email' => 'awa@jbhotel.local']);

        for ($i = 0; $i < 5; $i++) {
            $this->login('awa@jbhotel.local', 'faux')->assertStatus(422);
        }

        $this->login('awa@jbhotel.local')
            ->assertStatus(429)
            ->assertJsonPath('code', 'too_many_login_attempts')
            ->assertJsonPath('title', 'Trop de tentatives');
        $this->assertGuest('web');
    }

    public function test_disabled_account_cannot_log_in(): void
    {
        User::factory()->cashier()->inactive()->create(['email' => 'ancienne@jbhotel.local']);

        $this->login('ancienne@jbhotel.local')
            ->assertStatus(403)
            ->assertJsonPath('code', 'account_disabled')
            ->assertJsonPath('title', 'Compte désactivé');
        $this->assertGuest('web');
    }

    public function test_login_without_frontend_session_is_refused(): void
    {
        User::factory()->cashier()->create(['email' => 'awa@jbhotel.local']);

        $this->postJson('/api/v1/auth/login', ['email' => 'awa@jbhotel.local', 'password' => UserFactory::PASSWORD])
            ->assertStatus(400)
            ->assertJsonPath('code', 'session_unavailable');
    }

    public function test_current_user_requires_authentication(): void
    {
        $this->getJson('/api/v1/auth/me')
            ->assertStatus(401)
            ->assertJsonPath('title', 'Session expirée');
    }

    public function test_logout_ends_the_session(): void
    {
        User::factory()->cashier()->create(['email' => 'awa@jbhotel.local']);
        $this->login('awa@jbhotel.local')->assertOk();

        $this->withHeaders(self::FRONTEND)->postJson('/api/v1/auth/logout')->assertNoContent();

        $this->assertGuest('web');
        // En test, l'application (et le garde Sanctum en cache) survit entre deux requêtes ;
        // en production, chaque requête HTTP repart de zéro.
        $this->app['auth']->forgetGuards();
        $this->withHeaders(self::FRONTEND)->getJson('/api/v1/auth/me')->assertStatus(401);
    }

    public function test_account_disabled_during_a_session_loses_access_immediately(): void
    {
        $user = User::factory()->cashier()->create();
        $this->actingAs($user);

        $user->forceFill(['active' => false])->save();

        $this->getJson('/api/v1/auth/me')
            ->assertStatus(403)
            ->assertJsonPath('code', 'account_disabled');
    }

    public function test_login_and_logout_are_audited(): void
    {
        $user = User::factory()->cashier()->create(['email' => 'awa@jbhotel.local']);

        $this->login('awa@jbhotel.local')->assertOk();
        $this->withHeaders(self::FRONTEND)->postJson('/api/v1/auth/logout')->assertNoContent();

        $actions = AuditLog::query()->where('entity_type', 'user')->where('entity_id', $user->id)
            ->orderBy('id')->pluck('action')->all();
        $this->assertSame(['auth.login', 'auth.logout'], $actions);
        $this->assertSame($user->id, AuditLog::query()->firstOrFail()->actor_id);
    }
}
