<?php

namespace App\Modules\Identity\Application\Services;

use App\Modules\Identity\Events\PasswordResetRequested;
use App\Modules\Identity\Events\UserLoggedIn;
use App\Modules\Identity\Models\User;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Mail\Recipients;
use Illuminate\Auth\SessionGuard;
use Illuminate\Cache\RateLimiter;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
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

    public function login(string $email, string $password, bool $remember, string $ip, ?string $userAgent = null): User
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
        // Alerte de connexion par e-mail (6M), envoyée en file d'attente.
        event(new UserLoggedIn($user->id, $ip, $userAgent, now()->toIso8601String()));

        return $user;
    }

    /**
     * Mot de passe choisi depuis le lien de l'invitation (6M). Le lien sert une seule fois et
     * expire après 72 h ; un lien inconnu, expiré ou déjà utilisé reçoit la même réponse.
     */
    /**
     * Sortie de veille (D-074) : le mot de passe de l'utilisateur déjà connecté est vérifié sans
     * ouvrir de nouvelle session ni envoyer d'alerte de connexion. Les essais sont limités par la
     * route (6 par minute et par utilisateur).
     */
    public function confirmPassword(User $user, string $password): void
    {
        if (! Hash::check($password, (string) $user->password)) {
            throw ValidationException::withMessages(['password' => 'Mot de passe incorrect.']);
        }
    }

    /**
     * « Mot de passe oublié » (D-059). À la demande de l'utilisateur, le compte est vérifié avant
     * tout envoi et la réponse le dit clairement (compte introuvable, désactivé ou adresse qui ne peut
     * rien recevoir). Les demandes sont limitées à 5 par minute pour freiner les essais d'adresses.
     */
    public function requestPasswordReset(string $email): User
    {
        $user = User::query()->where('email', Str::lower(trim($email)))->first();
        if ($user === null) {
            throw new BusinessRuleException(
                'Aucun compte du personnel ne correspond à cette adresse e-mail. Vérifiez-la ou contactez l’administrateur.',
                'Compte introuvable',
                404,
                'account_not_found',
            );
        }
        if (! $user->active) {
            throw new BusinessRuleException(
                'Ce compte est désactivé : aucun lien ne peut être envoyé. Contactez l’administrateur.',
                'Compte désactivé',
                403,
                'account_disabled',
            );
        }
        if (! Recipients::deliverable($user->email)) {
            throw new BusinessRuleException(
                'L’adresse de ce compte ne peut recevoir aucun e-mail. Demandez à l’administrateur de changer votre mot de passe.',
                'Envoi impossible',
                422,
                'account_email_undeliverable',
            );
        }
        $this->audit->record('user.password_reset_requested', 'user', $user->id);
        event(new PasswordResetRequested($user->id));

        return $user;
    }

    /** @param  'invitation'|'reset'  $purpose  Lien d'invitation (72 h) ou de réinitialisation (60 min). */
    public function setPassword(string $email, string $token, string $password, string $purpose = 'invitation'): void
    {
        $status = Password::broker($purpose === 'reset' ? 'users' : 'invitations')->reset(
            ['email' => Str::lower(trim($email)), 'token' => $token, 'password' => $password],
            function (User $user, string $password) use ($purpose): void {
                $user->forceFill(['password' => $password])->save();
                $this->audit->record($purpose === 'reset' ? 'user.password_reset' : 'user.password_set', 'user', $user->id, actorId: $user->id);
            },
        );

        if ($status !== PasswordBroker::PASSWORD_RESET) {
            throw new BusinessRuleException(
                $purpose === 'reset'
                    ? 'Ce lien n’est plus valable : il a expiré ou a déjà servi. Refaites une demande depuis « Mot de passe oublié ».'
                    : 'Ce lien n’est plus valable : il a expiré ou a déjà servi. Demandez à l’administrateur de vous renvoyer l’invitation.',
                'Lien expiré',
                422,
                'invitation_invalid',
            );
        }
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
