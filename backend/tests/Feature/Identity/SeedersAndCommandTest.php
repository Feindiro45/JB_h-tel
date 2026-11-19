<?php

namespace Tests\Feature\Identity;

use App\Modules\Identity\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoUsersSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SeedersAndCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_full_seed_is_idempotent(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(2, User::query()->count());
        $this->assertSame(count(SettingsSeeder::DEFAULTS), DB::table('settings')->count());
        $this->assertTrue(User::query()->where('email', 'admin@jbhotel.local')->firstOrFail()->isAdmin());
    }

    public function test_settings_seeder_never_overwrites_an_admin_change(): void
    {
        $this->seed(SettingsSeeder::class);
        DB::table('settings')->where('key', 'discounts.cashier_max_percent')->update(['value' => json_encode(15)]);

        $this->seed(SettingsSeeder::class);

        $this->assertSame(15, json_decode((string) DB::table('settings')->where('key', 'discounts.cashier_max_percent')->value('value')));
    }

    public function test_demo_accounts_use_the_configured_password(): void
    {
        config(['jbhotel.demo_users_password' => 'DemoLocal2026']);
        $this->seed([RolesAndPermissionsSeeder::class, DemoUsersSeeder::class]);

        $cashier = User::query()->where('email', 'caissiere@jbhotel.local')->firstOrFail();
        $this->assertTrue(Hash::check('DemoLocal2026', $cashier->password));
        $this->assertSame('caissiere', $cashier->primaryRole()?->value);
    }

    public function test_demo_accounts_are_never_created_in_production(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->app['env'] = 'production';
        // `--force` : sans lui, `db:seed` demande une confirmation interactive en production.
        $this->artisan('db:seed', ['--class' => DemoUsersSeeder::class, '--force' => true])
            ->expectsOutputToContain('Comptes de démonstration ignorés hors environnement local.')
            ->assertSuccessful();

        $this->assertSame(0, User::query()->count());
    }

    public function test_create_admin_command_creates_an_administrator(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->artisan('jb:create-admin', ['--name' => 'Directeur JB', '--email' => 'Directeur@JBHotel.cf'])
            ->expectsQuestion('Mot de passe (10 caractères minimum, lettres et chiffres)', 'Direction2026')
            ->expectsQuestion('Confirmez le mot de passe', 'Direction2026')
            ->expectsOutput('Administrateur créé : directeur@jbhotel.cf')
            ->assertSuccessful();

        $user = User::query()->where('email', 'directeur@jbhotel.cf')->firstOrFail();
        $this->assertTrue($user->isAdmin());
        $this->assertTrue(Hash::check('Direction2026', $user->password));
    }

    public function test_create_admin_command_rejects_a_weak_password(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->artisan('jb:create-admin', ['--name' => 'Directeur', '--email' => 'directeur@jbhotel.cf'])
            ->expectsQuestion('Mot de passe (10 caractères minimum, lettres et chiffres)', 'court')
            ->expectsQuestion('Confirmez le mot de passe', 'court')
            ->assertFailed();

        $this->assertSame(0, User::query()->count());
    }
}
