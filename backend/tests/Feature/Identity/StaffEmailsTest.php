<?php

namespace Tests\Feature\Identity;

use App\Modules\Identity\Mail\StaffMail;
use App\Modules\Identity\Models\User;
use App\Shared\Audit\AuditLog;
use App\Shared\Mail\Recipients;
use Database\Factories\UserFactory;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * E-mails au personnel (6M, demande du 20/11/2026) : alerte à chaque connexion, bienvenue à la
 * création d'un compte et lien pour choisir son mot de passe.
 */
class StaffEmailsTest extends TestCase
{
    use RefreshDatabase;

    private const FRONTEND = ['Origin' => 'http://localhost:5173', 'Referer' => 'http://localhost:5173/'];

    private const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        Mail::fake();
    }

    public function test_each_login_sends_an_alert_with_date_ip_and_device(): void
    {
        $user = User::factory()->cashier()->create(['name' => 'Grâce', 'email' => 'grace@hotel.cf']);

        $this->withHeaders(self::FRONTEND + ['User-Agent' => self::BROWSER])
            ->postJson('/api/v1/auth/login', ['email' => 'grace@hotel.cf', 'password' => UserFactory::PASSWORD])
            ->assertOk();

        Mail::assertSent(StaffMail::class, function (StaffMail $mail) use ($user): bool {
            $html = $mail->render();
            $this->assertSame('staff.login_alert', $mail->kind);
            $this->assertStringContainsString('Nouvelle connexion à votre compte', $html);
            $this->assertStringContainsString('Edge sur Windows', $html);
            $this->assertStringContainsString('127.0.0.1', $html);
            $this->assertStringContainsString(now()->setTimezone('Africa/Bangui')->format('d/m/Y'), $html);

            return $mail->hasTo($user->email);
        });
    }

    public function test_failed_login_and_demo_accounts_send_nothing(): void
    {
        User::factory()->cashier()->create(['email' => 'grace@hotel.cf']);
        User::factory()->cashier()->create(['email' => 'demo@jbhotel.local']);

        $this->withHeaders(self::FRONTEND)->postJson('/api/v1/auth/login', ['email' => 'grace@hotel.cf', 'password' => 'mauvais'])->assertStatus(422);
        $this->app['auth']->forgetGuards();
        $this->withHeaders(self::FRONTEND)->postJson('/api/v1/auth/login', ['email' => 'demo@jbhotel.local', 'password' => UserFactory::PASSWORD])->assertOk();

        Mail::assertNothingSent();
    }

    public function test_account_without_password_gets_an_invitation_link_to_choose_it(): void
    {
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin)->postJson('/api/v1/users', [
            'name' => 'Nadia Kossi', 'email' => 'nadia@hotel.cf', 'role' => 'caissiere',
        ])->assertCreated();

        $link = null;
        Mail::assertSent(StaffMail::class, function (StaffMail $mail) use (&$link): bool {
            $link = $mail->actionUrl;
            $this->assertSame('staff.invitation', $mail->kind);
            $this->assertStringContainsString('Choisir mon mot de passe', $mail->render());

            return $mail->hasTo('nadia@hotel.cf');
        });
        $this->assertIsString($link);
        $this->assertStringStartsWith(config('jbhotel.frontend_url').'/mot-de-passe?token=', $link);
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);
        $this->assertSame('nadia@hotel.cf', $query['email']);

        // Sans mot de passe choisi, personne ne peut se connecter.
        $this->app['auth']->forgetGuards();
        $this->withHeaders(self::FRONTEND)->postJson('/api/v1/auth/login', ['email' => 'nadia@hotel.cf', 'password' => 'Choisi2026x'])->assertStatus(422);

        $this->postJson('/api/v1/auth/password', ['email' => 'nadia@hotel.cf', 'token' => $query['token'], 'password' => 'Choisi2026x', 'password_confirmation' => 'Choisi2026x'])
            ->assertOk()->assertJsonPath('message', 'Mot de passe enregistré. Vous pouvez vous connecter.');
        $this->withHeaders(self::FRONTEND)->postJson('/api/v1/auth/login', ['email' => 'nadia@hotel.cf', 'password' => 'Choisi2026x'])->assertOk();
        $this->assertSame(1, AuditLog::query()->where('action', 'user.password_set')->count());

        // Le lien ne sert qu'une fois.
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/auth/password', ['email' => 'nadia@hotel.cf', 'token' => $query['token'], 'password' => 'Autre2026xx', 'password_confirmation' => 'Autre2026xx'])
            ->assertStatus(422)->assertJsonPath('code', 'invitation_invalid')->assertJsonPath('title', 'Lien expiré');
    }

    public function test_invitation_link_expires_after_72_hours_and_can_be_sent_again(): void
    {
        $admin = User::factory()->admin()->create();
        $cashier = User::factory()->cashier()->create();
        $nadia = User::factory()->cashier()->create(['email' => 'nadia@hotel.cf']);
        $this->actingAs($admin)->postJson("/api/v1/users/{$nadia->uuid}/invitation")
            ->assertStatus(202)->assertJsonPath('message', 'Invitation envoyée à nadia@hotel.cf.');
        $token = $this->tokenFromLastInvitation();

        $this->travel(73)->hours();
        $this->postJson('/api/v1/auth/password', ['email' => 'nadia@hotel.cf', 'token' => $token, 'password' => 'Choisi2026x', 'password_confirmation' => 'Choisi2026x'])
            ->assertStatus(422)->assertJsonPath('code', 'invitation_invalid');

        $this->actingAs($cashier)->postJson("/api/v1/users/{$nadia->uuid}/invitation")->assertForbidden();
        $this->assertSame(1, AuditLog::query()->where('action', 'user.invitation_requested')->count());
        $this->assertSame(0, AuditLog::query()->where('after_json', 'like', '%'.$token.'%')->count());
    }

    public function test_password_rules_apply_to_the_invitation_form(): void
    {
        User::factory()->cashier()->create(['email' => 'nadia@hotel.cf']);

        $this->postJson('/api/v1/auth/password', ['email' => 'nadia@hotel.cf', 'token' => 'x', 'password' => 'court', 'password_confirmation' => 'autre'])
            ->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    public function test_account_created_with_a_password_gets_a_welcome_without_link(): void
    {
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin)->postJson('/api/v1/users', [
            'name' => 'Paul', 'email' => 'paul@hotel.cf', 'role' => 'caissiere',
            'password' => 'Bienvenue2026', 'password_confirmation' => 'Bienvenue2026',
        ])->assertCreated();

        Mail::assertSent(StaffMail::class, fn (StaffMail $mail) => $mail->kind === 'staff.welcome'
            && $mail->actionUrl === config('jbhotel.frontend_url').'/connexion'
            && $mail->hasTo('paul@hotel.cf'));
    }

    public function test_reserved_domains_never_receive_mail(): void
    {
        $this->assertFalse(Recipients::deliverable('admin@jbhotel.local'));
        $this->assertFalse(Recipients::deliverable('x@machine.test'));
        $this->assertFalse(Recipients::deliverable('pas-une-adresse'));
        $this->assertTrue(Recipients::deliverable('reception@banguiweb-tech.com'));
        $this->assertTrue(Recipients::deliverable('awa@exemple.cf'));
    }

    private function tokenFromLastInvitation(): string
    {
        $token = '';
        Mail::assertSent(StaffMail::class, function (StaffMail $mail) use (&$token): bool {
            parse_str((string) parse_url((string) $mail->actionUrl, PHP_URL_QUERY), $query);
            $token = (string) ($query['token'] ?? '');

            return $mail->kind === 'staff.invitation';
        });

        return $token;
    }

    /** D-059 : « mot de passe oublié », lien de 60 minutes à usage unique. */
    public function test_forgotten_password_sends_a_single_use_reset_link(): void
    {
        $user = User::factory()->cashier()->create(['email' => 'grace@hotel.cf']);
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'GRACE@hotel.cf'])
            ->assertStatus(202)
            ->assertJsonPath('message', 'Un e-mail contenant un lien de réinitialisation vient d’être envoyé à grace@hotel.cf. Ce lien est valable 60 minutes.');

        $link = '';
        Mail::assertSent(StaffMail::class, function (StaffMail $mail) use (&$link): bool {
            $link = (string) $mail->actionUrl;
            $this->assertStringContainsString('Choisir un nouveau mot de passe', $mail->render());

            return $mail->kind === 'staff.password_reset' && $mail->hasTo('grace@hotel.cf');
        });
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);
        $this->assertSame('oubli', $query['motif']);

        // Un lien de réinitialisation ne vaut pas invitation, et inversement.
        $this->postJson('/api/v1/auth/password', ['email' => $user->email, 'token' => $query['token'], 'password' => 'Nouveau2026x', 'password_confirmation' => 'Nouveau2026x'])
            ->assertStatus(422)->assertJsonPath('code', 'invitation_invalid');
        $this->postJson('/api/v1/auth/password', ['email' => $user->email, 'token' => $query['token'], 'password' => 'Nouveau2026x', 'password_confirmation' => 'Nouveau2026x', 'purpose' => 'reset'])
            ->assertOk();
        $this->withHeaders(self::FRONTEND)->postJson('/api/v1/auth/login', ['email' => 'grace@hotel.cf', 'password' => 'Nouveau2026x'])->assertOk();
        $this->assertSame(1, AuditLog::query()->where('action', 'user.password_reset')->count());

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/auth/password', ['email' => $user->email, 'token' => $query['token'], 'password' => 'Encore2026xx', 'password_confirmation' => 'Encore2026xx', 'purpose' => 'reset'])
            ->assertStatus(422)->assertJsonPath('message', 'Ce lien n’est plus valable : il a expiré ou a déjà servi. Refaites une demande depuis « Mot de passe oublié ».');
    }

    /** Demande de l'utilisateur (20/11/2026) : le compte est vérifié avant l'envoi, et la réponse le dit. */
    public function test_the_account_is_checked_before_sending_the_link(): void
    {
        User::factory()->cashier()->create(['email' => 'ancien@hotel.cf', 'active' => false]);
        User::factory()->cashier()->create(['email' => 'demo@jbhotel.local']);

        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'personne@hotel.cf'])
            ->assertStatus(404)->assertJsonPath('code', 'account_not_found')->assertJsonPath('title', 'Compte introuvable');
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'ancien@hotel.cf'])
            ->assertStatus(403)->assertJsonPath('code', 'account_disabled');
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'demo@jbhotel.local'])
            ->assertStatus(422)->assertJsonPath('code', 'account_email_undeliverable');
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'pas-une-adresse'])->assertStatus(422)->assertJsonValidationErrors(['email']);
        Mail::assertNothingSent();
        $this->assertSame(0, AuditLog::query()->where('action', 'user.password_reset_requested')->count());
    }
}
