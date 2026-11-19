<?php

namespace App\Shared\Audit;

use App\Shared\Contracts\AuditTrail;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Support\Arr;

final class DatabaseAuditTrail implements AuditTrail
{
    /** Clés jamais journalisées, par défense en profondeur. */
    private const SECRET_KEYS = ['password', 'password_confirmation', 'remember_token'];

    public function __construct(private readonly AuthFactory $auth) {}

    public function record(
        string $action,
        string $entityType,
        int $entityId,
        ?array $before = null,
        ?array $after = null,
        ?int $actorId = null,
    ): void {
        $authenticatedId = $this->auth->guard()->id();

        AuditLog::query()->create([
            'actor_id' => $actorId ?? (is_numeric($authenticatedId) ? (int) $authenticatedId : null),
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'before_json' => $before === null ? null : Arr::except($before, self::SECRET_KEYS),
            'after_json' => $after === null ? null : Arr::except($after, self::SECRET_KEYS),
            'ip_address' => app()->runningInConsole() ? null : request()->ip(),
            'occurred_at' => now(),
        ]);
    }
}
