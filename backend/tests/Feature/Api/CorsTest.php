<?php

namespace Tests\Feature\Api;

use Tests\TestCase;

/** Le frontend est une application distincte : CORS avec cookies, origines explicites seulement. */
class CorsTest extends TestCase
{
    public function test_preflight_from_frontend_origin_is_allowed_with_credentials(): void
    {
        $this->call('OPTIONS', '/api/v1/health', server: [
            'HTTP_ORIGIN' => 'http://localhost:5173',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'content-type,x-xsrf-token',
        ])
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    /**
     * En-têtes propres à l'application (poste, idempotence, rejeu hors ligne) : sans eux dans la
     * liste, le navigateur bloque la requête et le poste se croit hors ligne au retour du réseau.
     */
    public function test_preflight_allows_the_application_headers(): void
    {
        $response = $this->call('OPTIONS', '/api/v1/reservations', server: [
            'HTTP_ORIGIN' => 'http://localhost:5173',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'x-workstation-token,idempotency-key,x-offline-replay',
        ])->assertNoContent();

        $allowed = strtolower((string) $response->headers->get('Access-Control-Allow-Headers'));
        foreach (['x-workstation-token', 'idempotency-key', 'x-offline-replay'] as $header) {
            $this->assertStringContainsString($header, $allowed);
        }
    }

    public function test_request_from_frontend_origin_gets_cors_headers(): void
    {
        $response = $this->getJson('/api/v1/health', ['Origin' => 'http://localhost:5173'])
            ->assertOk()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        // Nom du fichier d'un export Excel, lu par le navigateur.
        $this->assertStringContainsString('Content-Disposition', (string) $response->headers->get('Access-Control-Expose-Headers'));
    }

    public function test_unknown_origin_is_not_allowed(): void
    {
        $response = $this->getJson('/api/v1/health', ['Origin' => 'https://site-inconnu.example']);

        // Avec une seule origine configurée, l'en-tête renvoie toujours cette origine :
        // le navigateur refuse alors toute autre origine. Une origine inconnue n'est jamais reprise.
        $this->assertNotSame(
            'https://site-inconnu.example',
            $response->headers->get('Access-Control-Allow-Origin'),
        );
    }
}
