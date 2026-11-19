<?php

namespace App\Shared\Contracts;

/**
 * Journal d'audit, utilisé par tous les modules.
 *
 * À appeler **dans la même transaction** que l'opération journalisée, pour que l'opération
 * et sa trace soient validées ou annulées ensemble. Ne jamais y placer de secret (mot de passe…).
 */
interface AuditTrail
{
    /**
     * @param  string  $action  Code stable, par exemple `user.created`, `reservation.extended`.
     * @param  string  $entityType  Type d'entité, par exemple `user`, `reservation`.
     * @param  array<string, mixed>|null  $before  État avant l'opération.
     * @param  array<string, mixed>|null  $after  État après l'opération.
     * @param  int|null  $actorId  Auteur ; par défaut, l'utilisateur authentifié.
     */
    public function record(
        string $action,
        string $entityType,
        int $entityId,
        ?array $before = null,
        ?array $after = null,
        ?int $actorId = null,
    ): void;
}
