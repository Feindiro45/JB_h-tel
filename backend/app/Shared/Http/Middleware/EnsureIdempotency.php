<?php

namespace App\Shared\Http\Middleware;

use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Idempotency\IdempotencyRecord;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Écriture idempotente (lot 3, alias `idempotent`) : avec l'en-tête `Idempotency-Key`, une
 * requête rejouée renvoie la réponse déjà enregistrée, sans refaire l'opération.
 *
 * - La clé est écrite dans la **même transaction** que l'opération (les transactions des services
 *   deviennent des points de sauvegarde) : jamais d'opération sans clé, ni de clé sans opération.
 * - Deux requêtes simultanées avec la même clé : la seconde attend la première sur l'index unique,
 *   puis rejoue sa réponse.
 * - Une erreur (4xx, 5xx) n'est jamais mémorisée : la même clé peut servir à un nouvel essai.
 * - Même clé, autres valeurs : refus explicite plutôt qu'une réponse trompeuse.
 * - Sans en-tête, la requête suit son cours habituel.
 */
final class EnsureIdempotency
{
    public const HEADER = 'Idempotency-Key';

    public const REPLAYED_HEADER = 'Idempotent-Replayed';

    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->header(self::HEADER);
        if ($key === null || $key === '') {
            return $next($request);
        }
        if (! Str::isUuid($key)) {
            throw new BusinessRuleException(
                'La clé de l’opération est invalide. Rechargez la page puis recommencez.',
                'Requête invalide', 422, 'idempotency_key_invalid',
            );
        }
        $userId = (int) $request->user()?->getAuthIdentifier();
        $hash = $this->fingerprint($request);

        $existing = $this->find($userId, $key);
        if ($existing !== null) {
            return $this->replay($existing, $hash);
        }

        try {
            return DB::transaction(function () use ($request, $next, $userId, $key, $hash): Response {
                $record = IdempotencyRecord::query()->create([
                    'user_id' => $userId,
                    'idempotency_key' => strtolower($key),
                    'method' => $request->method(),
                    'path' => mb_substr($request->path(), 0, 255),
                    'request_hash' => $hash,
                    'response_status' => 0,
                    'response_body' => '',
                ]);

                $response = $next($request);
                if (! $response->isSuccessful()) {
                    // Annule l'écriture de la clé : un nouvel essai reste possible.
                    throw new IdempotentFailure($response);
                }
                $record->forceFill([
                    'response_status' => $response->getStatusCode(),
                    'response_body' => (string) $response->getContent(),
                ])->save();

                return $response;
            });
        } catch (IdempotentFailure $failure) {
            return $failure->response;
        } catch (UniqueConstraintViolationException) {
            // Même clé reçue en parallèle : la première requête a validé, sa réponse est rejouée.
            $existing = $this->find($userId, $key) ?? throw new BusinessRuleException(
                'La même opération est en cours de traitement. Patientez quelques secondes puis rechargez la page.',
                'Opération en cours', 409, 'idempotency_in_progress',
            );

            return $this->replay($existing, $hash);
        }
    }

    private function find(int $userId, string $key): ?IdempotencyRecord
    {
        return IdempotencyRecord::query()
            ->where('user_id', $userId)
            ->where('idempotency_key', strtolower($key))
            ->first();
    }

    private function replay(IdempotencyRecord $record, string $hash): Response
    {
        if (! hash_equals($record->request_hash, $hash)) {
            throw new BusinessRuleException(
                'Cette opération a déjà été enregistrée avec d’autres valeurs. Rechargez la page et vérifiez la situation avant de recommencer.',
                'Opération déjà enregistrée', 422, 'idempotency_key_reused',
            );
        }

        return new HttpResponse($record->response_body, $record->response_status, [
            'Content-Type' => 'application/json',
            self::REPLAYED_HEADER => 'true',
        ]);
    }

    /** Empreinte de la requête : méthode, chemin et corps (clés triées). */
    private function fingerprint(Request $request): string
    {
        $body = $request->isJson() ? $request->json()->all() : $request->post();

        return hash('sha256', $request->method().' '.$request->path().' '.json_encode(self::sorted($body), JSON_THROW_ON_ERROR));
    }

    /**
     * @param  array<mixed>  $data
     * @return array<mixed>
     */
    private static function sorted(array $data): array
    {
        ksort($data);

        return array_map(fn ($value) => is_array($value) ? self::sorted($value) : $value, $data);
    }
}
