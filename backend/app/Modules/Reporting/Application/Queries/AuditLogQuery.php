<?php

namespace App\Modules\Reporting\Application\Queries;

use App\Modules\Reporting\DTO\AuditFilters;
use App\Shared\Audit\AuditLog;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Journal d'audit (lecture seule, droit `audit.view`) : libellés français, liens en UUID et
 * états avant/après **sans identifiant interne** (D-026, D-042). Les secrets ne sont jamais
 * journalisés (AuditTrail) ; rien n'est donc à masquer de plus ici.
 */
final class AuditLogQuery
{
    public const DOMAINS = [
        'reservation' => 'Réservations',
        'payment' => 'Caisse',
        'invoice' => 'Factures',
        'customer' => 'Clients',
        'room' => 'Chambres',
        'room_type' => 'Catégories de chambre',
        'rate' => 'Tarifs',
        'user' => 'Utilisateurs',
        'role' => 'Droits',
        'auth' => 'Connexions',
        'setting' => 'Paramètres',
        'notification' => 'E-mails',
        'mail' => 'Envoi des e-mails',
    ];

    public const ACTION_LABELS = [
        'auth.login' => 'Connexion',
        'auth.logout' => 'Déconnexion',
        'user.created' => 'Utilisateur créé',
        'user.updated' => 'Utilisateur modifié',
        'user.deleted' => 'Compte supprimé définitivement',
        'customer.deleted' => 'Client supprimé définitivement',
        'reservation.deleted' => 'Réservation supprimée définitivement',
        'reservation.modified' => 'Réservation modifiée',
        'room.deleted' => 'Chambre supprimée définitivement',
        'room_type.deleted' => 'Catégorie supprimée définitivement',
        'user.invitation_requested' => 'Invitation renvoyée',
        'user.invitation_sent' => 'E-mail de bienvenue envoyé',
        'user.password_set' => 'Mot de passe choisi depuis l’invitation',
        'user.password_reset_requested' => 'Mot de passe oublié : lien demandé',
        'user.password_reset_sent' => 'Mot de passe oublié : lien envoyé',
        'user.password_reset' => 'Mot de passe réinitialisé',
        'role.permissions_updated' => 'Droits d’un rôle modifiés',
        'customer.created' => 'Client créé',
        'customer.updated' => 'Fiche client modifiée',
        'customer.unsubscribed' => 'Client désinscrit des e-mails',
        'room_type.created' => 'Catégorie créée',
        'room_type.updated' => 'Catégorie modifiée',
        'room.created' => 'Chambre créée',
        'room.updated' => 'Chambre modifiée',
        'room.maintenance_changed' => 'Maintenance modifiée',
        'rate.published' => 'Tarif publié',
        'rate.withdrawn' => 'Tarif programmé retiré',
        'reservation.created' => 'Réservation créée',
        'reservation.confirmed' => 'Réservation confirmée',
        'reservation.checked_in' => 'Arrivée enregistrée',
        'reservation.checked_out' => 'Départ enregistré',
        'reservation.cancelled' => 'Réservation annulée',
        'reservation.extended' => 'Séjour prolongé',
        'reservation.occupants_updated' => 'Occupants modifiés',
        'payment.recorded' => 'Encaissement enregistré',
        'payment.cancelled' => 'Encaissement annulé',
        'payment.refunded' => 'Remboursement',
        'invoice.issued' => 'Facture émise',
        'invoice.credited' => 'Avoir émis',
        'notification.sent' => 'E-mail envoyé au client',
        'setting.updated' => 'Paramètre modifié',
        'mail.test_sent' => 'E-mail de test envoyé',
        'mail.retry_requested' => 'Envois en échec relancés',
    ];

    /** Table de chaque type d'entité, pour retrouver son UUID public. */
    private const ENTITY_TABLES = [
        'reservation' => 'reservations',
        'customer' => 'customers',
        'payment' => 'payments',
        'invoice' => 'invoices',
        'room' => 'rooms',
        'room_type' => 'room_types',
        'room_rate' => 'room_rates',
        'user' => 'users',
    ];

    private const ENTITY_LABELS = [
        'reservation' => 'Réservation',
        'customer' => 'Client',
        'payment' => 'Encaissement',
        'invoice' => 'Facture',
        'room' => 'Chambre',
        'room_type' => 'Catégorie',
        'room_rate' => 'Tarif',
        'user' => 'Utilisateur',
        'role' => 'Rôle',
        'setting' => 'Paramètre',
    ];

    /**
     * @return array{rows: list<array<string, mixed>>, page: LengthAwarePaginator<int, AuditLog>}
     */
    public function page(AuditFilters $filters, int $perPage = 50): array
    {
        $page = AuditLog::query()->with('actor')
            ->when($filters->domain !== null, fn (Builder $q) => $q->where('action', 'like', $filters->domain.'.%'))
            ->when($filters->actorId !== null, fn (Builder $q) => $q->where('actor_id', $filters->actorId))
            ->when($filters->from !== null, fn (Builder $q) => $q->where('occurred_at', '>=', $filters->from))
            ->when($filters->until !== null, fn (Builder $q) => $q->where('occurred_at', '<', $filters->until))
            ->orderByDesc('occurred_at')->orderByDesc('id')
            ->paginate($perPage);

        /** @var list<AuditLog> $logs */
        $logs = $page->items();
        $uuids = $this->entityUuids($logs);
        $roles = DB::table('roles')->pluck('name', 'id');

        $rows = array_map(fn (AuditLog $log) => [
            'id' => $log->uuid,
            'action' => $log->action,
            'label' => self::ACTION_LABELS[$log->action] ?? $log->action,
            'domain' => strstr($log->action, '.', true) ?: $log->action,
            'entity' => [
                'type' => $log->entity_type,
                'type_label' => self::ENTITY_LABELS[$log->entity_type] ?? $log->entity_type,
                // Rôle : son code (D-026) ; paramètre : sa clé, portée par l'état journalisé.
                'id' => match ($log->entity_type) {
                    'role' => $roles[$log->entity_id] ?? null,
                    'setting' => data_get($log->after_json, 'key'),
                    default => $uuids[$log->entity_type][$log->entity_id] ?? null,
                },
            ],
            'actor' => $log->actor === null ? null : ['id' => $log->actor->uuid, 'name' => $log->actor->name],
            'occurred_at' => $log->occurred_at->toIso8601String(),
            'ip_address' => $log->ip_address,
            'before' => self::publicState($log->before_json),
            'after' => self::publicState($log->after_json),
        ], $logs);

        return ['rows' => $rows, 'page' => $page];
    }

    /**
     * Une requête par type d'entité présent sur la page.
     *
     * @param  list<AuditLog>  $logs
     * @return array<string, array<int, string>>
     */
    private function entityUuids(array $logs): array
    {
        $ids = [];
        foreach ($logs as $log) {
            if (isset(self::ENTITY_TABLES[$log->entity_type])) {
                $ids[$log->entity_type][] = $log->entity_id;
            }
        }

        $uuids = [];
        foreach ($ids as $type => $list) {
            $uuids[$type] = DB::table(self::ENTITY_TABLES[$type])->whereIn('id', array_unique($list))
                ->pluck('uuid', 'id')->map(fn ($uuid) => (string) $uuid)->all();
        }

        return $uuids;
    }

    /**
     * Retire les identifiants internes (`id`, `…_id`, `…_by` entiers), à tous les niveaux.
     *
     * @param  array<array-key, mixed>|null  $state
     * @return array<array-key, mixed>|null
     */
    public static function publicState(?array $state): ?array
    {
        if ($state === null) {
            return null;
        }
        $clean = [];
        foreach ($state as $key => $value) {
            if (is_string($key) && is_int($value) && ($key === 'id' || str_ends_with($key, '_id') || str_ends_with($key, '_by'))) {
                continue;
            }
            $clean[$key] = is_array($value) ? self::publicState($value) : $value;
        }

        return $clean;
    }
}
