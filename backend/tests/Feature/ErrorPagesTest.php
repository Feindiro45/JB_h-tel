<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/** Pages d'erreur du serveur (D-060) : en français, à l'identité de l'hôtel, sans détail technique. */
class ErrorPagesTest extends TestCase
{
    public function test_unknown_web_page_shows_the_french_404_page(): void
    {
        $this->get('/page-qui-n-existe-pas', ['Accept' => 'text/html'])
            ->assertNotFound()
            ->assertSee('Erreur 404')
            ->assertSee('Page introuvable')
            ->assertSee('Revenir en arrière')
            ->assertDontSee('Not Found');

        // L'API garde son contrat JSON.
        $this->getJson('/api/v1/route-inconnue')->assertNotFound()->assertJsonStructure(['title', 'message']);
    }

    public function test_server_error_never_shows_technical_details(): void
    {
        config(['app.debug' => false]);
        Route::middleware('web')->get('/_essai/panne', fn () => throw new RuntimeException('Détail interne secret'));

        $this->get('/_essai/panne', ['Accept' => 'text/html'])
            ->assertStatus(500)
            ->assertSee('Erreur interne')
            ->assertSee('Réessayer')
            ->assertDontSee('Détail interne secret')
            ->assertDontSee('RuntimeException');
    }

    public function test_every_error_page_renders_its_code_and_message(): void
    {
        foreach ([
            '403' => 'Accès refusé', '404' => 'Page introuvable', '419' => 'Page expirée',
            '429' => 'Trop de demandes', '500' => 'Erreur interne', '503' => 'Service momentanément indisponible',
        ] as $code => $title) {
            $html = view("errors.{$code}")->render();
            $this->assertStringContainsString("Erreur {$code}", $html, "Page {$code}");
            $this->assertStringContainsString($title, $html, "Page {$code}");
            $this->assertStringContainsString('lang="fr"', $html, "Page {$code}");
        }

        $html = view('errors.5xx', ['exception' => new HttpException(505)])->render();
        $this->assertStringContainsString('505', $html);
        $this->assertStringContainsString('Service indisponible', $html);
    }
}
