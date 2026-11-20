<?php

namespace App\Shared\Support;

use App\Modules\Identity\Models\User;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Suppression définitive d'une saisie (D-058, administrateur seulement). Dans une seule
 * transaction : copie complète au journal d'audit (avant, motif, auteur), puis suppression.
 * Les clés étrangères en RESTRICT servent de filet : si la base refuse parce que la saisie est
 * encore utilisée ailleurs, rien n'est supprimé et la réponse l'explique en français.
 */
final class RecordDeletion
{
    public function __construct(private readonly AuditTrail $audit) {}

    /** @param  array<string, mixed>  $snapshot  Contenu complet conservé au journal (jamais de secret). */
    public function delete(Model $model, string $action, string $entityType, array $snapshot, string $reason, User $actor, string $inUseMessage): void
    {
        DB::transaction(function () use ($model, $action, $entityType, $snapshot, $reason, $actor, $inUseMessage): void {
            $this->audit->record($action, $entityType, (int) $model->getKey(), $snapshot, ['reason' => $reason, 'deleted' => true], $actor->id);
            try {
                $model->delete();
            } catch (Throwable $exception) {
                // Violation de clé étrangère (SQLSTATE 23xxx) : la saisie est encore référencée.
                if ($exception instanceof QueryException && str_starts_with((string) $exception->getCode(), '23')) {
                    throw new BusinessRuleException($inUseMessage, 'Suppression impossible', 409, 'record_in_use');
                }
                throw $exception;
            }
        });
    }
}
