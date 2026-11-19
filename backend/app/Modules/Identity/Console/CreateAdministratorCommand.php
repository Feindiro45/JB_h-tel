<?php

namespace App\Modules\Identity\Console;

use App\Modules\Identity\Application\Services\UserAdministrationService;
use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\DTO\CreateUserData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Crée le premier administrateur (production). Le mot de passe est saisi de façon masquée :
 * il n'apparaît ni dans l'historique du terminal, ni dans le code (fiche 06).
 */
final class CreateAdministratorCommand extends Command
{
    protected $signature = 'jb:create-admin {--name= : Nom complet} {--email= : Adresse e-mail}';

    protected $description = 'Crée un compte administrateur JB Hôtel (mot de passe saisi de façon masquée).';

    public function handle(UserAdministrationService $users): int
    {
        $name = (string) ($this->option('name') ?: $this->ask('Nom complet'));
        $email = strtolower(trim((string) ($this->option('email') ?: $this->ask('Adresse e-mail'))));
        $password = (string) $this->secret('Mot de passe (10 caractères minimum, lettres et chiffres)');
        $confirmation = (string) $this->secret('Confirmez le mot de passe');

        $validator = Validator::make(
            ['name' => $name, 'email' => $email, 'password' => $password, 'password_confirmation' => $confirmation],
            [
                'name' => ['required', 'string', 'max:160'],
                'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
                'password' => ['required', 'confirmed', Password::min(10)->letters()->numbers()],
            ],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        $user = $users->create(new CreateUserData($name, $email, $password, RoleName::Admin));
        $this->info("Administrateur créé : {$user->email}");

        return self::SUCCESS;
    }
}
