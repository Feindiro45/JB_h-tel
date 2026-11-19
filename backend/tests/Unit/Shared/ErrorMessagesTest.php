<?php

namespace Tests\Unit\Shared;

use App\Shared\Exceptions\ErrorMessages;
use PHPUnit\Framework\TestCase;

class ErrorMessagesTest extends TestCase
{
    public function test_known_statuses_have_dedicated_french_messages(): void
    {
        $this->assertSame('Opération impossible', ErrorMessages::forStatus(409)['title']);
        $this->assertSame('Service indisponible', ErrorMessages::forStatus(503)['title']);
    }

    public function test_unknown_server_error_falls_back_to_generic_incident(): void
    {
        $this->assertSame(ErrorMessages::forStatus(500), ErrorMessages::forStatus(502));
    }

    public function test_unknown_client_error_falls_back_to_generic_refusal(): void
    {
        $this->assertSame('Demande refusée', ErrorMessages::forStatus(418)['title']);
    }
}
