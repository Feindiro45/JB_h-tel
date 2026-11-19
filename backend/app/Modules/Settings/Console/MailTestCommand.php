<?php

namespace App\Modules\Settings\Console;

use App\Modules\Settings\Application\MailCheck;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Console\Command;

/** Vérifie la configuration SMTP depuis le serveur (6M) : `php artisan jb:mail-test adresse@exemple.cf`. */
final class MailTestCommand extends Command
{
    protected $signature = 'jb:mail-test {to : Adresse qui recevra l\'e-mail de test}';

    protected $description = 'Envoie immédiatement un e-mail de test avec la configuration actuelle';

    public function handle(MailCheck $mail): int
    {
        $to = (string) $this->argument('to');
        if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            $this->components->error('Adresse e-mail invalide.');

            return self::INVALID;
        }

        $status = $mail->status();
        $this->components->twoColumnDetail('Mode d’envoi', $status['delivers'] ? "{$status['transport']} (envoi réel)" : "{$status['transport']} (aucun envoi réel)");
        if ($status['host'] !== null) {
            $this->components->twoColumnDetail('Serveur', "{$status['host']}:{$status['port']}");
        }
        $this->components->twoColumnDetail('Expéditeur', "{$status['from_name']} <{$status['from_address']}>");

        try {
            $mail->sendTest($to, null);
        } catch (BusinessRuleException $exception) {
            $this->components->error($exception->getMessage());
            foreach ($exception->details() as $detail) {
                $this->line('  '.$detail);
            }

            return self::FAILURE;
        }

        $this->components->info("E-mail de test envoyé à {$to}.");
        if (! $status['delivers']) {
            $this->components->warn('Le mode actuel n’envoie rien réellement : réglez MAIL_MAILER=smtp dans backend/.env.');
        }

        return self::SUCCESS;
    }
}
