<?php

namespace App\Modules\Sync\Application\Queries;

use App\Modules\Sync\DTO\ChangeFeedFilters;
use App\Modules\Sync\Models\SyncChange;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Support\Carbon;

/**
 * Lecture du journal des changements (D-069). Le curseur n'avance que sur les lignes plus
 * anciennes que `jbhotel.sync.commit_lag_seconds` : une transaction plus lente, dont l'identifiant
 * est plus petit mais validée plus tard, n'est jamais sautée. Les lignes récentes sont tout de même
 * rendues (actualisation rapide) et le seront de nouveau au passage suivant, sans effet de bord.
 */
final class ChangeFeed
{
    public const PROTOCOL = 1;

    public static function encode(int $id): string
    {
        return 'v1.'.$id;
    }

    public static function decode(?string $cursor): int
    {
        return $cursor === null ? 0 : (int) substr($cursor, 3);
    }

    private function lagLimit(): Carbon
    {
        return now()->subSeconds((int) config('jbhotel.sync.commit_lag_seconds', 15));
    }

    /** Curseur sûr pour un poste qui vient de tout recharger. */
    public function currentCursor(): int
    {
        $young = SyncChange::query()->where('occurred_at', '>', $this->lagLimit())->min('id');
        if ($young !== null) {
            return (int) $young - 1;
        }

        return (int) (SyncChange::query()->max('id') ?? 0);
    }

    /** @return array{protocol: int, server_time: string, cursor: string, retention_days: int, poll_seconds: int} */
    public function status(): array
    {
        return [
            'protocol' => self::PROTOCOL,
            'server_time' => now()->toIso8601String(),
            'cursor' => self::encode($this->currentCursor()),
            'retention_days' => (int) config('jbhotel.sync.retention_days', 365),
            'poll_seconds' => (int) config('jbhotel.sync.poll_seconds', 30),
        ];
    }

    /**
     * @param  list<string>  $visible  types de données que l'utilisateur peut consulter
     * @return array{data: list<array{entity: string, id: string|null, action: string, occurred_at: string}>, meta: array{cursor: string, has_more: bool, protocol: int}}
     */
    public function changes(ChangeFeedFilters $filters, array $visible): array
    {
        $oldest = SyncChange::query()->min('id');
        if ($filters->after > 0 && $oldest !== null && $filters->after < (int) $oldest - 1) {
            throw new BusinessRuleException(
                'Les changements du serveur depuis la dernière synchronisation de ce poste ne sont plus conservés. Les données du poste vont être rechargées entièrement.',
                'Rechargement nécessaire',
                410,
                'sync_cursor_expired',
            );
        }

        $rows = SyncChange::query()
            ->where('id', '>', $filters->after)
            ->orderBy('id')
            ->limit($filters->limit + 1)
            ->get();
        $hasMore = $rows->count() > $filters->limit;
        $rows = $rows->take($filters->limit);

        $limit = $this->lagLimit();
        $next = $filters->after;
        $blocked = false;
        foreach ($rows as $row) {
            if ($row->occurred_at->greaterThan($limit)) {
                $blocked = true;
                break;
            }
            $next = $row->id;
        }

        $data = [];
        foreach ($rows as $row) {
            if (in_array($row->entity, $visible, true)) {
                $data[] = [
                    'entity' => $row->entity,
                    'id' => $row->entity_uuid,
                    'action' => $row->action,
                    'occurred_at' => $row->occurred_at->toIso8601String(),
                ];
            }
        }

        return [
            'data' => $data,
            'meta' => [
                'cursor' => self::encode($next),
                'has_more' => $hasMore && ! $blocked,
                'protocol' => self::PROTOCOL,
            ],
        ];
    }
}
