<?php

namespace App\Modules\Settings\Application;

use App\Modules\Identity\Models\User;
use App\Modules\Settings\Mail\MailTestMail;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Mail\Recipients;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Envoi des e-mails (6M, demande du 20/11/2026) : état de la configuration et e-mail de test.
 * Aucun secret n'est exposé (ni identifiant ni mot de passe SMTP) ; une erreur d'envoi est
 * expliquée en français, avec le code SMTP quand il existe, et détaillée seulement dans le journal.
 */
final class MailCheck
{
    /** Transports qui remettent réellement les messages (les autres les écrivent ou les gardent en mémoire). */
    private const DELIVERING = ['smtp', 'sendmail', 'ses', 'ses-v2', 'postmark', 'resend', 'mailgun'];

    public function __construct(private readonly AuditTrail $audit) {}

    /** @return array<string, mixed> */
    public function status(): array
    {
        $mailer = (string) config('mail.default');
        /** @var array<string, mixed> $settings */
        $settings = (array) config("mail.mailers.{$mailer}", []);
        $transport = (string) ($settings['transport'] ?? $mailer);
        $smtp = $transport === 'smtp';
        $queue = (string) config('queue.default');

        return [
            'mailer' => $mailer,
            'transport' => $transport,
            'delivers' => in_array($transport, self::DELIVERING, true),
            'host' => $smtp ? (string) ($settings['host'] ?? '') : null,
            'port' => $smtp ? (int) ($settings['port'] ?? 0) : null,
            'scheme' => $smtp ? ($settings['scheme'] ?? null) : null,
            'authenticated' => $smtp && filled($settings['username'] ?? null),
            'from_address' => (string) config('mail.from.address'),
            'from_name' => (string) config('mail.from.name'),
            'queue' => [
                'connection' => $queue,
                // File « database » : les e-mails attendent qu'un processus `php artisan queue:work` les envoie.
                'needs_worker' => ! in_array($queue, ['sync', 'null'], true),
                'pending' => $queue === 'database' && Schema::hasTable('jobs') ? DB::table('jobs')->count() : null,
                'failed' => Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->count() : null,
            ],
        ];
    }

    /** Envoie immédiatement (sans file d'attente) un e-mail de test, pour un retour instantané. */
    public function sendTest(string $to, ?User $actor): void
    {
        if (! Recipients::deliverable($to)) {
            throw new BusinessRuleException(
                "L’adresse {$to} ne peut recevoir aucun e-mail : son domaine est réservé aux essais (.local, .test…).",
                'Adresse non joignable',
                422,
                'mail_recipient_reserved',
                ['Saisissez une adresse réelle, par exemple celle de l’hôtel.'],
            );
        }
        try {
            Mail::to($to)->send(new MailTestMail($actor?->name));
        } catch (Throwable $exception) {
            report($exception);
            [$message, $hint] = self::explain($exception->getMessage());
            $code = preg_match('/\b([45]\d\d)\b/', $exception->getMessage(), $match) === 1 ? $match[1] : null;

            throw new BusinessRuleException(
                $message,
                'Envoi impossible',
                502,
                'mail_failed',
                array_values(array_filter([$hint, $code !== null ? "Code renvoyé par le serveur : {$code}." : null])),
            );
        }

        // L'adresse complète n'est pas journalisée : seulement son domaine.
        $this->audit->record('mail.test_sent', 'setting', 0, after: [
            'recipient_domain' => substr((string) strrchr($to, '@'), 1),
            'mailer' => (string) config('mail.default'),
        ], actorId: $actor?->id);
    }

    /**
     * Remet en file les envois classés en échec (D-054), par exemple après correction du mot de
     * passe SMTP. Renvoie le nombre d'envois relancés.
     */
    public function retryFailed(User $actor): int
    {
        $count = Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->count() : 0;
        if ($count > 0) {
            Artisan::call('queue:retry', ['id' => ['all']]);
        }
        $this->audit->record('mail.retry_requested', 'setting', 0, after: ['count' => $count], actorId: $actor->id);

        return $count;
    }

    /** @return array{0: string, 1: string} Message et piste de correction, en français. */
    public static function explain(string $error): array
    {
        $error = mb_strtolower($error);

        return match (true) {
            str_contains($error, 'authenticat') => [
                'Le serveur d’envoi a refusé l’identifiant ou le mot de passe.',
                'Vérifiez MAIL_USERNAME et MAIL_PASSWORD dans backend/.env (souvent l’adresse e-mail complète).',
            ],
            str_contains($error, 'certificate'), str_contains($error, 'ssl'), str_contains($error, 'tls'), str_contains($error, 'crypto') => [
                'La connexion chiffrée avec le serveur d’envoi a échoué.',
                'Vérifiez MAIL_SCHEME : « smtps » pour le port 465, « smtp » pour le port 587.',
            ],
            str_contains($error, 'connection could not be established'), str_contains($error, 'unable to connect'),
            str_contains($error, 'timed out'), str_contains($error, 'getaddrinfo'), str_contains($error, 'refused') => [
                'Le serveur d’envoi est injoignable.',
                'Vérifiez MAIL_HOST et MAIL_PORT, et que le poste a accès à Internet.',
            ],
            default => [
                'Le serveur d’envoi a refusé le message.',
                'Vérifiez l’adresse d’expédition (MAIL_FROM_ADDRESS) : elle doit appartenir au compte SMTP.',
            ],
        };
    }
}
