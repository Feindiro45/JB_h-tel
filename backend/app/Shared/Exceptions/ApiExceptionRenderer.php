<?php

namespace App\Shared\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Contrat d'erreur de l'API : `{ "title", "message", "errors"?, "code"? }`, toujours en français.
 *
 * Aucune trace, requête SQL ou message interne n'est renvoyé, même en mode debug :
 * le détail technique reste dans les journaux (le rapport d'exception n'est pas affecté).
 */
final class ApiExceptionRenderer
{
    public function __invoke(Throwable $e, Request $request): ?JsonResponse
    {
        if (! $request->is('api/*') && ! $request->expectsJson()) {
            return null;
        }

        // Réponse déjà construite volontairement par l'application : on la laisse passer.
        if ($e instanceof HttpResponseException) {
            return null;
        }

        return $this->render($e);
    }

    public function render(Throwable $e): JsonResponse
    {
        if ($e instanceof ValidationException) {
            return $this->respond(422, errors: $e->errors());
        }

        if ($e instanceof BusinessRuleException) {
            $body = [
                'title' => $e->title(),
                'message' => $e->getMessage(),
                'code' => $e->errorCode(),
            ];
            if ($e->details() !== []) {
                $body['details'] = $e->details();
            }

            return new JsonResponse($body, $e->status());
        }

        if ($e instanceof AuthenticationException) {
            return $this->respond(401);
        }

        // Laravel convertit déjà les exceptions d'autorisation (403), de modèle introuvable (404)
        // et de jeton CSRF (419) en exceptions HTTP avant d'appeler ce rendu.
        if ($e instanceof HttpExceptionInterface) {
            return $this->respond($e->getStatusCode(), headers: $e->getHeaders());
        }

        return $this->respond(500);
    }

    /**
     * @param  array<string, array<int, string>>|null  $errors
     * @param  array<string, string>  $headers
     */
    private function respond(int $status, ?array $errors = null, array $headers = []): JsonResponse
    {
        $body = ErrorMessages::forStatus($status);
        if ($errors !== null) {
            $body['errors'] = $errors;
        }

        return new JsonResponse($body, $status, $headers);
    }
}
