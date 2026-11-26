<?php

namespace App\Shared\Http\Middleware;

use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

/** Réponse d'erreur à renvoyer telle quelle, après annulation de la transaction de la clé. */
final class IdempotentFailure extends RuntimeException
{
    public function __construct(public readonly Response $response)
    {
        parent::__construct('Opération en échec : clé d’idempotence non conservée.');
    }
}
