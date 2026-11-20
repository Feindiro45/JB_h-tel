<?php

namespace App\Modules\Identity\Listeners;

use App\Modules\Identity\Events\PasswordResetRequested;
use App\Modules\Identity\Events\UserInvited;
use App\Modules\Identity\Events\UserLoggedIn;
use App\Modules\Identity\Mail\StaffMail;
use App\Modules\Identity\Models\User;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Mail\Recipients;
use App\Shared\Mail\RetriesMailDelivery;
use App\Shared\Support\Format;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;

/**
 * E-mails au personnel (6M, demande du 20/11/2026), envoyés **en file d'attente** : un serveur
 * d'envoi lent ou indisponible ne bloque jamais la connexion ni la création d'un compte, et
 * l'envoi est retenté automatiquement.
 */
final class SendStaffEmails implements ShouldQueue
{
    public const EVENTS = [UserLoggedIn::class, UserInvited::class, PasswordResetRequested::class];

    // Retenté pendant 24 h, pause commune si le serveur SMTP refuse (D-054).
    use RetriesMailDelivery;

    public function __construct(private readonly AuditTrail $audit) {}

    public function handle(UserLoggedIn|UserInvited|PasswordResetRequested $event): void
    {
        $user = User::query()->find($event->userId);
        // Comptes de démonstration (@jbhotel.local) : aucun serveur ne peut les recevoir.
        if ($user === null || ! Recipients::deliverable($user->email)) {
            return;
        }

        match (true) {
            $event instanceof UserLoggedIn => $this->loginAlert($user, $event),
            $event instanceof UserInvited => $this->invitation($user, $event),
            default => $this->passwordReset($user),
        };
    }

    private function loginAlert(User $user, UserLoggedIn $event): void
    {
        Mail::to($user->email, $user->name)->send(new StaffMail(
            kind: 'staff.login_alert',
            subjectLine: 'Nouvelle connexion à votre compte',
            heading: 'Nouvelle connexion à votre compte',
            recipientName: $user->name,
            lines: ['Une connexion à votre compte JB Hôtel vient d’avoir lieu.'],
            details: [
                'Date et heure' => Format::dateTime(CarbonImmutable::parse($event->at)),
                'Adresse IP' => $event->ip,
                'Appareil' => self::device($event->userAgent),
            ],
            footnote: 'Si ce n’est pas vous, prévenez immédiatement l’administrateur : il peut désactiver le compte. Ne communiquez jamais votre mot de passe.',
        ));
    }

    /** Lien « mot de passe oublié » (D-059) : valable 60 minutes, à usage unique. */
    private function passwordReset(User $user): void
    {
        if (! $user->active) {
            return;
        }
        $token = Password::broker('users')->createToken($user);
        $url = config('jbhotel.frontend_url').'/mot-de-passe?'.http_build_query(['token' => $token, 'email' => $user->email, 'motif' => 'oubli']);
        $minutes = (int) config('auth.passwords.users.expire', 60);
        Mail::to($user->email, $user->name)->send(new StaffMail(
            kind: 'staff.password_reset',
            subjectLine: 'Réinitialisation de votre mot de passe',
            heading: 'Choisissez un nouveau mot de passe',
            recipientName: $user->name,
            lines: [
                'Une demande de réinitialisation du mot de passe de votre compte JB Hôtel vient d’être faite.',
                "Ce lien est personnel, valable {$minutes} minutes et ne sert qu’une fois.",
            ],
            details: ['Identifiant' => $user->email],
            actionLabel: 'Choisir un nouveau mot de passe',
            actionUrl: $url,
            footnote: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable. Ne transférez jamais ce lien.',
        ));
        $this->audit->record('user.password_reset_sent', 'user', $user->id, after: ['kind' => 'staff.password_reset']);
    }

    private function invitation(User $user, UserInvited $event): void
    {
        $role = $user->primaryRole()?->label() ?? 'Membre du personnel';
        if ($event->withPasswordLink) {
            $token = Password::broker('invitations')->createToken($user);
            $url = config('jbhotel.frontend_url').'/mot-de-passe?'.http_build_query(['token' => $token, 'email' => $user->email]);
            $hours = intdiv((int) config('auth.passwords.invitations.expire', 4320), 60);
            $mail = new StaffMail(
                kind: 'staff.invitation',
                subjectLine: 'Votre accès à JB Hôtel',
                heading: 'Bienvenue dans l’équipe',
                recipientName: $user->name,
                lines: [
                    'Un compte vient d’être créé pour vous dans l’application de gestion de JB Hôtel.',
                    "Choisissez votre mot de passe pour l’activer. Ce lien est personnel et valable {$hours} heures.",
                ],
                details: ['Identifiant' => $user->email, 'Rôle' => $role],
                actionLabel: 'Choisir mon mot de passe',
                actionUrl: $url,
                footnote: 'Si le lien a expiré, demandez à l’administrateur de vous renvoyer l’invitation. Si vous n’attendiez pas ce message, ignorez-le.',
            );
        } else {
            $mail = new StaffMail(
                kind: 'staff.welcome',
                subjectLine: 'Votre accès à JB Hôtel',
                heading: 'Bienvenue dans l’équipe',
                recipientName: $user->name,
                lines: [
                    'Un compte vient d’être créé pour vous dans l’application de gestion de JB Hôtel.',
                    'Votre mot de passe vous est communiqué par l’administrateur.',
                ],
                details: ['Identifiant' => $user->email, 'Rôle' => $role],
                actionLabel: 'Ouvrir JB Hôtel',
                actionUrl: config('jbhotel.frontend_url').'/connexion',
            );
        }

        Mail::to($user->email, $user->name)->send($mail);
        // Jamais de jeton dans le journal : seulement le type d'e-mail envoyé.
        $this->audit->record('user.invitation_sent', 'user', $user->id, after: ['kind' => $mail->kind]);
    }

    /** Navigateur et système, pour reconnaître l'appareil sans stocker l'empreinte complète. */
    public static function device(?string $userAgent): string
    {
        $ua = (string) $userAgent;
        if (trim($ua) === '') {
            return 'Inconnu';
        }
        $browser = match (true) {
            str_contains($ua, 'Edg/') => 'Edge',
            str_contains($ua, 'OPR/') => 'Opera',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Chrome/') => 'Chrome',
            str_contains($ua, 'Safari/') => 'Safari',
            default => 'Navigateur inconnu',
        };
        $system = match (true) {
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'iPhone'), str_contains($ua, 'iPad') => 'iOS',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Mac OS X') => 'macOS',
            str_contains($ua, 'Linux') => 'Linux',
            default => 'système inconnu',
        };

        return "{$browser} sur {$system}";
    }
}
