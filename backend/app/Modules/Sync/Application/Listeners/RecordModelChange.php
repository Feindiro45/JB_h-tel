<?php

namespace App\Modules\Sync\Application\Listeners;

use App\Modules\Sync\Domain\SyncEntity;
use App\Modules\Sync\Models\SyncChange;
use Illuminate\Database\Eloquent\Model;

/**
 * Note chaque création, modification ou suppression des données suivies (D-069). L'événement
 * Eloquent est déclenché pendant la transaction de l'opération : la ligne du journal est
 * validée ou annulée avec elle (aucun changement annoncé pour une opération refusée).
 */
final class RecordModelChange
{
    private const ACTIONS = ['created' => 'created', 'updated' => 'updated', 'deleted' => 'deleted'];

    /** @param  array<int, mixed>  $payload */
    public function handle(string $event, array $payload): void
    {
        $model = $payload[0] ?? null;
        if (! $model instanceof Model || $model instanceof SyncChange) {
            return;
        }
        $name = substr($event, strlen('eloquent.'));
        $action = self::ACTIONS[substr($name, 0, (int) strpos($name, ':'))] ?? null;
        if ($action === null) {
            return;
        }
        $attributes = $model->getAttributes();
        $table = $model->getTable();
        $entity = SyncEntity::forTable($table);
        $uuid = isset($attributes['uuid']) && is_string($attributes['uuid']) ? $attributes['uuid'] : null;
        if ($entity === null && $table === 'audit_logs' && $action === 'created') {
            $entity = SyncEntity::forAuditedType((string) ($attributes['entity_type'] ?? ''));
            $action = 'updated';
            $uuid = null;
        }
        if ($entity === null) {
            return;
        }
        SyncChange::query()->create([
            'entity' => $entity->value,
            'entity_uuid' => $uuid,
            'action' => $action,
            'occurred_at' => now(),
        ]);
    }
}
