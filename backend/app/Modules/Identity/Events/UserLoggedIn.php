<?php

namespace App\Modules\Identity\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Connexion réussie d'un membre du personnel (6M) : déclenche l'alerte de connexion par e-mail. */
final class UserLoggedIn implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly int $userId,
        public readonly string $ip,
        public readonly ?string $userAgent,
        public readonly string $at,
    ) {}
}
