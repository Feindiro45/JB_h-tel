<?php

namespace Tests\Feature\Api;

use App\Modules\Identity\Models\User;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

/**
 * Règle validée : toute erreur destinée à l'utilisateur est en français, sans trace technique,
 * au format { title, message, errors? } consommé par la modale du frontend.
 */
class ErrorContractTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Gate::define('action-interdite', fn (?User $user) => false);

        Route::prefix('api/v1/__test')->middleware('api')->group(function (): void {
            Route::post('validation', fn (Request $request) => $request->validate([
                'email' => ['required', 'email'],
            ]));
            Route::get('business', fn () => throw new BusinessRuleException(
                'La chambre 101 est déjà réservée sur cette période.',
                'Chambre indisponible',
                409,
                'room_unavailable',
            ));
            Route::get('crash', fn () => throw new RuntimeException('SQLSTATE[42S02] table secrète jb_interne'));
            Route::get('forbidden', fn () => Gate::authorize('action-interdite'));
            Route::get('protected', fn () => 'ok')->middleware('auth:sanctum');
            Route::get('missing-model', fn () => throw (new ModelNotFoundException)->setModel(User::class, [999]));
            Route::get('throttled', fn () => 'ok')->middleware('throttle:1,1');
        });
    }

    public function test_validation_errors_are_in_french_with_field_details(): void
    {
        $this->postJson('/api/v1/__test/validation', [])
            ->assertStatus(422)
            ->assertJsonPath('title', 'Données invalides')
            ->assertJsonPath('errors.email.0', 'Le champ adresse e-mail est obligatoire.');
    }

    public function test_business_rule_violation_keeps_its_french_title_message_and_code(): void
    {
        $this->getJson('/api/v1/__test/business')
            ->assertStatus(409)
            ->assertExactJson([
                'title' => 'Chambre indisponible',
                'message' => 'La chambre 101 est déjà réservée sur cette période.',
                'code' => 'room_unavailable',
            ]);
    }

    public function test_unexpected_error_never_exposes_technical_details_even_in_debug_mode(): void
    {
        config(['app.debug' => true]);

        $response = $this->getJson('/api/v1/__test/crash')
            ->assertStatus(500)
            ->assertJsonPath('title', 'Incident technique');

        $content = (string) $response->getContent();
        $this->assertStringNotContainsString('SQLSTATE', $content);
        $this->assertStringNotContainsString('jb_interne', $content);
        $response->assertJsonMissingPath('trace')->assertJsonMissingPath('exception')->assertJsonMissingPath('file');
    }

    public function test_guest_on_protected_route_gets_401(): void
    {
        $this->getJson('/api/v1/__test/protected')
            ->assertStatus(401)
            ->assertJsonPath('title', 'Session expirée');
    }

    public function test_denied_authorization_gets_403(): void
    {
        $this->getJson('/api/v1/__test/forbidden')
            ->assertStatus(403)
            ->assertJsonPath('title', 'Accès refusé');
    }

    public function test_missing_model_and_unknown_route_get_404(): void
    {
        $this->getJson('/api/v1/__test/missing-model')
            ->assertStatus(404)
            ->assertJsonPath('title', 'Élément introuvable');

        $this->getJson('/api/v1/route-inexistante')
            ->assertStatus(404)
            ->assertJsonPath('title', 'Élément introuvable');
    }

    public function test_wrong_http_method_gets_405(): void
    {
        $this->postJson('/api/v1/health')
            ->assertStatus(405)
            ->assertJsonPath('title', 'Opération non prise en charge');
    }

    public function test_rate_limited_request_gets_429_with_retry_after(): void
    {
        $this->getJson('/api/v1/__test/throttled')->assertOk();

        $this->getJson('/api/v1/__test/throttled')
            ->assertStatus(429)
            ->assertJsonPath('title', 'Trop de demandes')
            ->assertHeader('Retry-After');
    }
}
