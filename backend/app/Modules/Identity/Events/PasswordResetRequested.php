<?php

namespace App\Modules\Identity\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** « Mot de passe oublié » (D-059) : déclenche l'e-mail avec un lien valable 60 minutes. */
final class PasswordResetRequested implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $userId) {}
}
