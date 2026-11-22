<?php

namespace Tests\Feature\Api;

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class SubdirectoryDeploymentTest extends TestCase
{
    private function mountedGet(string $path): Response
    {
        $request = Request::create('https://banguiweb-tech.com/backend'.$path, 'GET', server: [
            'SCRIPT_NAME' => '/backend/index.php',
            'SCRIPT_FILENAME' => '/htdocs/backend/index.php',
            'PHP_SELF' => '/backend/index.php',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_ORIGIN' => 'https://banguiweb-tech.com',
        ]);

        $this->assertSame('/backend', $request->getBaseUrl());

        return $this->app->make(Kernel::class)->handle($request);
    }

    public function test_api_routes_keep_their_json_authentication_contract_under_the_folder(): void
    {
        $response = $this->mountedGet('/api/v1/auth/me');

        $this->assertSame(401, $response->getStatusCode());
        $this->assertSame('Session expirée', json_decode($response->getContent(), true)['title']);
    }

    public function test_generated_urls_include_the_backend_folder(): void
    {
        $response = $this->mountedGet('/');

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('https://banguiweb-tech.com/backend/api/v1', json_decode($response->getContent(), true)['api']);
    }

    public function test_csrf_cookie_is_readable_from_the_frontend_at_the_root(): void
    {
        config(['session.driver' => 'array', 'session.domain' => null, 'session.path' => '/', 'session.secure' => true]);

        $response = $this->mountedGet('/sanctum/csrf-cookie');

        $this->assertSame(204, $response->getStatusCode());
        $cookies = array_values(array_filter($response->headers->getCookies(), fn ($cookie) => $cookie->getName() === 'XSRF-TOKEN'));
        $this->assertCount(1, $cookies);
        $this->assertSame('/', $cookies[0]->getPath());
        $this->assertNull($cookies[0]->getDomain());
        $this->assertTrue($cookies[0]->isSecure());
        $this->assertFalse($cookies[0]->isHttpOnly());
    }
}
