<?php

namespace Database\Seeders;

use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Comptes de démonstration, **uniquement en local et en test**. Aucun mot de passe n'est codé
 * en dur (fiche 06) : il est lu dans DEMO_USERS_PASSWORD, ou généré aléatoirement puis affiché.
 * Un compte déjà existant n'est pas modifié.
 */
class DemoUsersSeeder extends Seeder
{
    /** @var array<string, array{name: string, role: RoleName}> */
    public const ACCOUNTS = [
        'admin@jbhotel.local' => ['name' => 'Administrateur Démo', 'role' => RoleName::Admin],
        'caissiere@jbhotel.local' => ['name' => 'Caissière Démo', 'role' => RoleName::Cashier],
    ];

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('Comptes de démonstration ignorés hors environnement local.');

            return;
        }

        $configured = config('jbhotel.demo_users_password');
        $password = is_string($configured) && $configured !== '' ? $configured : Str::password(16, symbols: false);
        $created = [];

        foreach (self::ACCOUNTS as $email => $account) {
            if (User::query()->where('email', $email)->exists()) {
                continue;
            }

            $user = User::query()->create([
                'name' => $account['name'],
                'email' => $email,
                'password' => $password,
                'active' => true,
            ]);
            $user->assignRole($account['role']->value);
            $created[] = [$email, $account['role']->label()];
        }

        if ($created !== []) {
            $this->command->table(['E-mail', 'Rôle'], $created);
            $this->command->warn("Mot de passe des comptes de démonstration : {$password}");
        }
    }
}
