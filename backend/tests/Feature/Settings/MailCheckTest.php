<?php

namespace Tests\Feature\Settings;

use App\Modules\Cashier\Events\PaymentRecorded;
use App\Modules\Identity\Listeners\SendStaffEmails;
use App\Modules\Identity\Models\User;
use App\Modules\Notifications\Listeners\NotifyCustomer;
use App\Modules\Settings\Mail\MailTestMail;
use App\Shared\Audit\AuditLog;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\Middleware\ThrottlesExceptions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Envoi des e-mails (6M) : état de la configuration, e-mail de test et explications en français. */
class MailCheckTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->admin = User::factory()->admin()->create(['email' => 'direction@hotel.cf']);
        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => 'mail.hebergeur.cf',
            'mail.mailers.smtp.port' => 465,
            'mail.mailers.smtp.scheme' => 'smtps',
            'mail.mailers.smtp.username' => 'compte-secret@hebergeur.cf',
            'mail.mailers.smtp.password' => 'MotDePasseSecret!7',
        ]);
    }

    public function test_status_describes_the_configuration_without_any_secret(): void
    {
        $response = $this->actingAs($this->admin)->getJson('/api/v1/settings/mail')->assertOk()
            ->assertJsonPath('data.transport', 'smtp')
            ->assertJsonPath('data.delivers', true)
            ->assertJsonPath('data.host', 'mail.hebergeur.cf')
            ->assertJsonPath('data.port', 465)
            ->assertJsonPath('data.authenticated', true)
            ->assertJsonPath('data.queue.connection', 'sync')
            ->assertJsonPath('data.queue.needs_worker', false);

        $this->assertStringNotContainsString('MotDePasseSecret', $response->getContent() ?: '');
        $this->assertStringNotContainsString('compte-secret', $response->getContent() ?: '');
    }

    public function test_test_email_is_sent_immediately_and_audited_without_the_address(): void
    {
        Mail::fake();

        $this->actingAs($this->admin)->postJson('/api/v1/settings/mail/test', ['to' => 'reception@hotel.cf'])
            ->assertOk()->assertJsonPath('message', 'E-mail de test envoyé à reception@hotel.cf.');
        $this->actingAs($this->admin)->postJson('/api/v1/settings/mail/test')
            ->assertOk()->assertJsonPath('message', 'E-mail de test envoyé à direction@hotel.cf.');

        Mail::assertSent(MailTestMail::class, fn (MailTestMail $mail) => $mail->hasTo('reception@hotel.cf'));
        Mail::assertSent(MailTestMail::class, fn (MailTestMail $mail) => $mail->hasTo('direction@hotel.cf'));
        $audit = AuditLog::query()->where('action', 'mail.test_sent')->firstOrFail();
        $this->assertSame('hotel.cf', $audit->after_json['recipient_domain'] ?? null);
        $this->assertStringNotContainsString('reception@', (string) json_encode($audit->after_json));
    }

    public function test_unreachable_server_is_explained_in_french(): void
    {
        config(['mail.mailers.smtp.host' => '127.0.0.1', 'mail.mailers.smtp.port' => 1, 'mail.mailers.smtp.scheme' => 'smtp']);

        $this->actingAs($this->admin)->postJson('/api/v1/settings/mail/test', ['to' => 'reception@hotel.cf'])
            ->assertStatus(502)
            ->assertJsonPath('code', 'mail_failed')
            ->assertJsonPath('title', 'Envoi impossible')
            ->assertJsonPath('message', 'Le serveur d’envoi est injoignable.');
        $this->assertSame(0, AuditLog::query()->where('action', 'mail.test_sent')->count());
    }

    public function test_reserved_addresses_and_non_admins_are_refused(): void
    {
        Mail::fake();
        $this->actingAs($this->admin)->postJson('/api/v1/settings/mail/test', ['to' => 'admin@jbhotel.local'])
            ->assertStatus(422)->assertJsonPath('code', 'mail_recipient_reserved');
        $this->actingAs($this->admin)->postJson('/api/v1/settings/mail/test', ['to' => 'pas-une-adresse'])
            ->assertStatus(422)->assertJsonValidationErrors(['to']);

        $cashier = User::factory()->cashier()->create();
        $this->actingAs($cashier)->getJson('/api/v1/settings/mail')->assertForbidden();
        $this->actingAs($cashier)->postJson('/api/v1/settings/mail/test')->assertForbidden();
        Mail::assertNothingSent();
    }

    public function test_console_command_reports_success_and_invalid_addresses(): void
    {
        Mail::fake();

        $this->artisan('jb:mail-test', ['to' => 'reception@hotel.cf'])
            ->expectsOutputToContain('E-mail de test envoyé à reception@hotel.cf.')
            ->assertSuccessful();
        $this->artisan('jb:mail-test', ['to' => 'pas-une-adresse'])->assertExitCode(2);
        Mail::assertSent(MailTestMail::class, 1);
    }

    /** D-054 : un envoi n'est jamais perdu, et un SMTP qui refuse n'est pas sollicité en boucle. */
    public function test_mail_listeners_retry_for_a_day_and_pause_together_when_smtp_fails(): void
    {
        foreach ([NotifyCustomer::class, SendStaffEmails::class] as $listener) {
            $instance = $this->app->make($listener);
            $this->assertInstanceOf(ThrottlesExceptions::class, $instance->middleware()[0], $listener);
            $this->assertTrue($instance->retryUntil()->getTimestamp() >= now()->addHours(23)->getTimestamp(), $listener);
        }
    }

    public function test_failed_sends_are_put_back_in_the_queue(): void
    {
        config(['queue.default' => 'database']);
        event(new PaymentRecorded(999));
        $job = DB::table('jobs')->sole();
        DB::table('jobs')->delete();
        DB::table('failed_jobs')->insert([
            'uuid' => (string) Str::uuid(), 'connection' => 'database', 'queue' => $job->queue,
            'payload' => $job->payload, 'exception' => 'Expected response code "235" but got code "535"', 'failed_at' => now(),
        ]);
        $this->actingAs($this->admin)->getJson('/api/v1/settings/mail')->assertJsonPath('data.queue.failed', 1);

        $this->actingAs($this->admin)->postJson('/api/v1/settings/mail/retry')
            ->assertOk()->assertJsonPath('message', '1 envoi relancé.')
            ->assertJsonPath('data.queue.failed', 0)
            ->assertJsonPath('data.queue.pending', 1);
        $this->actingAs($this->admin)->postJson('/api/v1/settings/mail/retry')
            ->assertOk()->assertJsonPath('message', 'Aucun envoi en échec à relancer.');
        $this->assertSame(2, AuditLog::query()->where('action', 'mail.retry_requested')->count());
        $this->actingAs(User::factory()->cashier()->create())->postJson('/api/v1/settings/mail/retry')->assertForbidden();
    }
}
