<?php

namespace App\Modules\Identity\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Compte créé ou invitation renvoyée (6M) : déclenche l'e-mail de bienvenue. Avec
 * `withPasswordLink`, l'e-mail contient un lien pour choisir son mot de passe (valable 72 h).
 */
final class UserInvited implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly int $userId,
        public readonly bool $withPasswordLink,
    ) {}
}
