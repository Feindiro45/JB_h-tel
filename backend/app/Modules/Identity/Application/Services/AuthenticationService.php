<?php

namespace App\Modules\Identity\Application\Services;

use App\Modules\Identity\Models\User;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Auth\SessionGuard;
use Illuminate\Cache\RateLimiter;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Connexion par session (Sanctum, mode SPA — docs/DECISIONS.md D-005).
 * Limite : 5 tentatives par minute et par couple e-mail + adresse IP.
 */
final class AuthenticationService
{
    public const MAX_ATTEMPTS = 5;

    public const DECAY_SECONDS = 60;

    public function __construct(
        private readonly AuthFactory $auth,
        private readonly RateLimiter $limiter,
        private readonly AuditTrail $audit,
    ) {}

    public function login(string $email, string $password, bool $remember, string $ip): User
    {
        $key = $this->throttleKey($email, $ip);

        if ($this->limiter->tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            throw new BusinessRuleException(
                (string) __('auth.throttle', ['seconds' => $this->limiter->availableIn($key)]),
                'Trop de tentatives',
                429,
                'too_many_login_attempts',
            );
        }

        $guard = $this->guard();
        $credentials = ['email' => $email, 'password' => $password];

        if (! $guard->validate($credentials)) {
            $this->limiter->hit($key, self::DECAY_SECONDS);

            throw ValidationException::withMessages(['email' => [(string) __('auth.failed')]]);
        }

        /** @var User $user */
        $user = $guard->getLastAttempted();

        if (! $user->active) {
            throw new BusinessRuleException(
                "Ce compte est désactivé. Contactez l'administrateur.",
                'Compte désactivé',
                403,
                'account_disabled',
            );
        }

        $this->limiter->clear($key);
        $guard->login($user, $remember);
        $user->forceFill(['last_login_at' => now()])->save();
        $this->audit->record('auth.login', 'user', $user->id, actorId: $user->id);

        return $user;
    }

    public function logout(User $user): void
    {
        $this->audit->record('auth.logout', 'user', $user->id, actorId: $user->id);
        $this->guard()->logout();
    }

    private function guard(): SessionGuard
    {
        /** @var SessionGuard $guard */
        $guard = $this->auth->guard('web');

        return $guard;
    }

    private function throttleKey(string $email, string $ip): string
    {
        return 'login:'.Str::lower(trim($email)).'|'.$ip;
    }
}
