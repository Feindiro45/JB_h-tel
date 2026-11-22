<?php

namespace App\Modules\Workstations\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\Workstations\Models\OfflineOperation;
use App\Modules\Workstations\Models\Workstation;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Http\Middleware\EnsureIdempotency;
use App\Shared\Offline\OfflineReplay;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Journal des opérations faites hors ligne (lot 4A.4, D-064). Le poste signale un rejeu par
 * l'en-tête `X-Offline-Replay` (base64 d'un JSON : opération, libellé, date sur le poste) ; le
 * serveur note la réponse : acceptée, doublon évité (clé d'idempotence déjà enregistrée) ou refusée
 * avec sa cause. Les échecs passagers (session expirée, trop de requêtes, panne) ne sont pas notés :
 * le poste réessaiera.
 */
final class OfflineJournal
{
    public const HEADER = OfflineReplay::HEADER;

    /** Réponses passagères : l'opération reste en attente sur le poste et repartira. */
    private const TEMPORARY = [401, 408, 419, 429];

    public function __construct(private readonly AuditTrail $audit) {}

    public function record(Request $request, Response $response): void
    {
        $user = $request->user();
        $key = (string) $request->header(EnsureIdempotency::HEADER, '');
        $replay = OfflineReplay::fromRequest($request);
        $status = $response->getStatusCode();
        if (! $user instanceof User || $replay === null || ! preg_match('/^[0-9a-f-]{36}$/i', $key)) {
            return;
        }
        if (in_array($status, self::TEMPORARY, true) || $status >= 500 || $status < 200) {
            return;
        }

        $outcome = $status < 300
            ? ($response->headers->get(EnsureIdempotency::REPLAYED_HEADER) === 'true' ? OfflineOperation::DUPLICATE : OfflineOperation::ACCEPTED)
            : OfflineOperation::REJECTED;
        $reason = $outcome === OfflineOperation::REJECTED ? self::reason($response) : [null, null, null];
        $workstation = Workstation::findByToken($request->header(Workstation::HEADER));

        DB::transaction(function () use ($user, $key, $replay, $request, $status, $outcome, $reason, $workstation): void {
            $existing = OfflineOperation::query()
                ->where(['user_id' => $user->id, 'idempotency_key' => strtolower($key)])
                ->lockForUpdate()
                ->first();
            $values = [
                'workstation_id' => $workstation !== null ? $workstation->id : $existing?->workstation_id,
                'kind' => $replay->kind,
                'label' => $replay->label,
                'method' => strtoupper($request->method()),
                'path' => mb_substr('/'.ltrim($request->path(), '/'), 0, 255),
                'created_offline_at' => $replay->createdAt,
                'received_at' => now(),
                'outcome' => $outcome,
                'http_status' => $status,
                'reason_title' => $reason[0],
                'reason' => $reason[1],
                'reason_code' => $reason[2],
            ];
            if ($existing === null) {
                OfflineOperation::query()->create($values + [
                    'idempotency_key' => strtolower($key),
                    'user_id' => $user->id,
                    'review_status' => $outcome === OfflineOperation::REJECTED ? OfflineOperation::TO_REVIEW : null,
                ]);

                return;
            }
            // Nouvel essai de la même opération (après « Réessayer ») : le dernier résultat compte.
            $existing->fill($values + [
                'attempts' => $existing->attempts + 1,
                'review_status' => $outcome === OfflineOperation::REJECTED
                    ? ($existing->review_status ?? OfflineOperation::TO_REVIEW)
                    : null,
            ])->save();
        });
    }

    /**
     * L'administrateur clôt un refus : opération ressaisie par ailleurs, ou rejet confirmé.
     * Inscrit au journal d'audit.
     */
    public function review(OfflineOperation $operation, string $resolution, string $reason, User $actor): OfflineOperation
    {
        if ($operation->outcome !== OfflineOperation::REJECTED) {
            throw new BusinessRuleException(
                'Seule une opération refusée par le serveur peut être examinée.',
                'Examen impossible',
                409,
                'offline_operation_not_rejected',
            );
        }

        return DB::transaction(function () use ($operation, $resolution, $reason, $actor): OfflineOperation {
            $before = ['review_status' => $operation->review_status, 'review_reason' => $operation->review_reason];
            $operation->forceFill([
                'review_status' => $resolution,
                'reviewed_by' => $actor->id,
                'reviewed_at' => now(),
                'review_reason' => $reason,
            ])->save();
            $this->audit->record('offline_operation.reviewed', 'offline_operation', $operation->id, $before, [
                'review_status' => $resolution,
                'review_reason' => $reason,
                'operation' => $operation->label,
            ], $actor->id);

            return $operation;
        });
    }

    /** @return array{0: ?string, 1: ?string, 2: ?string} titre, message et code du refus (contrat d'erreur JSON). */
    private static function reason(Response $response): array
    {
        $body = json_decode((string) $response->getContent(), true);
        if (! is_array($body)) {
            return [null, null, null];
        }
        $message = is_string($body['message'] ?? null) ? $body['message'] : null;
        $errors = is_array($body['errors'] ?? null) ? $body['errors'] : [];
        $first = collect($errors)->flatten()->first();
        if (is_string($first) && $first !== $message) {
            $message = trim(($message ?? '').' '.$first);
        }

        return [
            is_string($body['title'] ?? null) ? mb_substr($body['title'], 0, 160) : null,
            $message,
            is_string($body['code'] ?? null) ? mb_substr($body['code'], 0, 80) : null,
        ];
    }
}
