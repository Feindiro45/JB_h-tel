<?php

namespace Tests\Feature\Workstations;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\RoomCatalog\Application\Services\RateService;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\DTO\PublishRateData;
use App\Modules\Workstations\Models\OfflineOperation;
use App\Modules\Workstations\Models\Workstation;
use App\Shared\Audit\AuditLog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * Module administrateur « Mode hors ligne » (lot 4A) : état déclaré par les postes, règles hors
 * ligne envoyées au poste, journal des opérations rejouées (acceptées, doublons, refus) et examen
 * des refus par l'administrateur seul.
 */
class OfflineModuleTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    private string $reservation;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
        $this->reservation = $this->bookOk(['confirm' => true]);
    }

    private function token(): string
    {
        return (string) $this->actingAs($this->cashier)->postJson('/api/v1/workstations/register')
            ->assertCreated()->json('token');
    }

    /** En-tête d'un rejeu hors ligne : base64 du JSON {kind, label, created_at}. */
    private static function replay(string $kind, string $label): string
    {
        return rtrim(strtr(base64_encode((string) json_encode([
            'kind' => $kind,
            'label' => $label,
            'created_at' => '2026-12-01T08:30:00+01:00',
        ])), '+/', '-_'), '=');
    }

    /** @return TestResponse<Response> */
    private function replayPayment(string $key, int $amount, ?string $token = null): TestResponse
    {
        return $this->actingAs($this->cashier)
            ->withHeaders(array_filter([
                'Idempotency-Key' => $key,
                'X-Offline-Replay' => self::replay('payment.record', "Encaissement de {$amount} FCFA — chambre 101"),
                Workstation::HEADER => $token,
            ]))
            ->postJson("/api/v1/reservations/{$this->reservation}/payments", ['amount_fcfa' => $amount, 'method' => 'CASH']);
    }

    public function test_the_workstation_reports_its_offline_state_and_receives_the_offline_rules(): void
    {
        $token = $this->token();

        $this->actingAs($this->cashier)->withHeader(Workstation::HEADER, $token)
            ->postJson('/api/v1/workstations/heartbeat', ['report' => [
                'pending_operations' => 3,
                'rejected_operations' => 1,
                'oldest_pending_at' => '2026-12-01T07:00:00+01:00',
                'last_sync_at' => '2026-12-01T09:00:00+01:00',
                'last_sync_status' => 'partial',
                'last_backup_at' => null,
                'storage_persisted' => true,
            ]])
            ->assertOk()
            ->assertJsonPath('data.offline_rules.lock_after_minutes', 15)
            ->assertJsonPath('data.offline_rules.backup_reminder_minutes', 60)
            ->assertJsonPath('data.offline_rules.provisional_prefix', 'LOC')
            ->assertJsonCount(11, 'data.offline_rules.allowed_operations');

        $station = Workstation::findByToken($token);
        $this->assertNotNull($station);
        $this->assertSame(3, $station->pending_operations);
        $this->assertSame(1, $station->rejected_operations);
        $this->assertSame('partial', $station->last_sync_status);
        $this->assertTrue($station->storage_persisted);
        $this->assertSame('2026-12-01 07:00:00', $station->oldest_pending_at?->format('Y-m-d H:i:s'));
        $this->assertNotNull($station->reported_at);

        // Un état incohérent est refusé en français ; le signal seul reste accepté.
        $this->actingAs($this->cashier)->withHeader(Workstation::HEADER, $token)
            ->postJson('/api/v1/workstations/heartbeat', ['report' => ['pending_operations' => -1, 'rejected_operations' => 0]])
            ->assertUnprocessable();
        $this->actingAs($this->cashier)->withHeader(Workstation::HEADER, $token)
            ->postJson('/api/v1/workstations/heartbeat')->assertOk();
        $this->assertSame(3, $station->refresh()->pending_operations);

        // Les règles suivent l'écran Paramètres (valeurs provisoires, validées par le serveur).
        $this->actingAs($this->admin)->putJson('/api/v1/settings/offline.allowed_operations', ['value' => ['payment.record']])->assertOk();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/offline.provisional_prefix', ['value' => 'HL'])->assertOk();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/offline.provisional_prefix', ['value' => 'loc'])->assertUnprocessable();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/offline.allowed_operations', ['value' => ['tout']])->assertUnprocessable();
        $this->actingAs($this->cashier)->withHeader(Workstation::HEADER, $token)
            ->postJson('/api/v1/workstations/heartbeat')
            ->assertJsonPath('data.offline_rules.allowed_operations', ['payment.record'])
            ->assertJsonPath('data.offline_rules.provisional_prefix', 'HL');
    }

    public function test_replayed_operations_are_journaled_as_accepted_duplicate_or_rejected(): void
    {
        $token = $this->token();
        $key = (string) Str::uuid();

        $this->replayPayment($key, 20000, $token)->assertCreated();
        $operation = OfflineOperation::query()->sole();
        $this->assertSame(OfflineOperation::ACCEPTED, $operation->outcome);
        $this->assertSame('payment.record', $operation->kind);
        $this->assertSame('Encaissement de 20000 FCFA — chambre 101', $operation->label);
        $this->assertSame('2026-12-01 08:30:00', $operation->created_offline_at?->format('Y-m-d H:i:s'));
        $this->assertSame(Workstation::findByToken($token)?->id, $operation->workstation_id);
        $this->assertNull($operation->review_status);

        // Même clé rejouée (réponse perdue pendant la coupure) : aucun doublon, noté comme tel.
        $this->replayPayment($key, 20000, $token)->assertCreated()->assertHeader('Idempotent-Replayed', 'true');
        $operation->refresh();
        $this->assertSame(OfflineOperation::DUPLICATE, $operation->outcome);
        $this->assertSame(2, $operation->attempts);
        $this->assertSame(1, OfflineOperation::query()->count());

        // Refus du serveur : cause gardée en français, à examiner.
        $this->replayPayment((string) Str::uuid(), 900000, $token)->assertUnprocessable();
        $refused = OfflineOperation::query()->where('outcome', OfflineOperation::REJECTED)->sole();
        $this->assertSame(422, $refused->http_status);
        $this->assertNotEmpty($refused->reason);
        $this->assertNotNull($refused->reason_code);
        $this->assertSame(OfflineOperation::TO_REVIEW, $refused->review_status);

        // Sans en-tête de rejeu, ou sans session (le poste réessaiera) : rien n'est noté.
        $this->flushHeaders();
        $this->actingAs($this->cashier)->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson("/api/v1/reservations/{$this->reservation}/payments", ['amount_fcfa' => 1000, 'method' => 'CASH'])
            ->assertCreated();
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders([
            'Idempotency-Key' => (string) Str::uuid(),
            'X-Offline-Replay' => self::replay('payment.record', 'Encaissement'),
        ])->postJson("/api/v1/reservations/{$this->reservation}/payments", ['amount_fcfa' => 1000, 'method' => 'CASH'])
            ->assertUnauthorized();
        $this->assertSame(2, OfflineOperation::query()->count());
    }

    public function test_only_the_administrator_supervises_and_reviews_refusals(): void
    {
        $token = $this->token();
        $this->replayPayment((string) Str::uuid(), 20000, $token)->assertCreated();
        $this->replayPayment((string) Str::uuid(), 900000, $token)->assertUnprocessable();
        $refused = OfflineOperation::query()->where('outcome', OfflineOperation::REJECTED)->sole();
        $accepted = OfflineOperation::query()->where('outcome', OfflineOperation::ACCEPTED)->sole();

        $this->assertContains(PermissionName::OfflineManage, PermissionName::adminOnly());
        $this->actingAs($this->cashier)->getJson('/api/v1/offline/overview')->assertForbidden();
        $this->actingAs($this->cashier)->getJson('/api/v1/offline/operations')->assertForbidden();
        $this->actingAs($this->cashier)
            ->postJson("/api/v1/offline/operations/{$refused->uuid}/review", ['resolution' => 'REENTERED', 'reason' => 'Ressaisi'])
            ->assertForbidden();

        $this->actingAs($this->admin)->getJson('/api/v1/offline/overview')
            ->assertOk()
            ->assertJsonPath('data.today.accepted', 1)
            ->assertJsonPath('data.today.rejected', 1)
            ->assertJsonPath('data.today.duplicates', 0)
            ->assertJsonPath('data.to_review', 1)
            ->assertJsonPath('data.main', null)
            ->assertJsonPath('data.workstations.0.report.pending_operations', 0);

        $this->actingAs($this->admin)->getJson('/api/v1/offline/operations?review=TO_REVIEW')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $refused->uuid)
            ->assertJsonPath('data.0.outcome_label', 'Refusée')
            ->assertJsonPath('data.0.review_label', 'À examiner')
            ->assertJsonPath('data.0.kind_label', 'Encaissement')
            ->assertJsonPath('data.0.user', 'Grâce');

        $this->actingAs($this->admin)
            ->postJson("/api/v1/offline/operations/{$refused->uuid}/review", ['resolution' => 'REENTERED', 'reason' => 'x'])
            ->assertUnprocessable();
        $this->actingAs($this->admin)
            ->postJson("/api/v1/offline/operations/{$accepted->uuid}/review", ['resolution' => 'REENTERED', 'reason' => 'Ressaisi'])
            ->assertStatus(409)->assertJsonPath('code', 'offline_operation_not_rejected');
        $this->actingAs($this->admin)
            ->postJson("/api/v1/offline/operations/{$refused->uuid}/review", ['resolution' => 'REENTERED', 'reason' => 'Ressaisi en ligne pour 20 000 FCFA'])
            ->assertOk()
            ->assertJsonPath('data.review_label', 'Ressaisie')
            ->assertJsonPath('data.reviewed_by', 'Directeur');
        $this->assertSame(1, AuditLog::query()->where('action', 'offline_operation.reviewed')->count());
        $this->actingAs($this->admin)->getJson('/api/v1/offline/overview')->assertJsonPath('data.to_review', 0);
    }

    /**
     * Rejeu d'une écriture faite hors ligne à l'heure donnée (heure de Bangui).
     *
     * @return array<string, string>
     */
    private function replayAt(string $createdAt, string $kind): array
    {
        return [
            'Idempotency-Key' => (string) Str::uuid(),
            'X-Offline-Replay' => rtrim(strtr(base64_encode((string) json_encode([
                'kind' => $kind,
                'label' => $kind,
                'created_at' => CarbonImmutable::parse($createdAt, 'Africa/Bangui')->toIso8601String(),
            ])), '+/', '-_'), '='),
        ];
    }

    /**
     * N-09 (décision de l'utilisateur, 22/11/2026) : une réservation faite hors ligne garde le tarif
     * en vigueur sur le poste à ce moment-là, même si un nouveau tarif est entré en vigueur avant le
     * retour du réseau. Moment dans le futur ou trop ancien : tarif de l'heure du serveur.
     */
    public function test_changed_offline_rates_require_review_and_unchanged_rates_are_accepted(): void
    {
        $pending = $this->bookOk(['confirm' => false, 'start_date' => '2026-12-05', 'end_date' => '2026-12-05']);
        // 10:00 : le tarif VIP journée passe de 50 000 à 60 000 FCFA.
        app(RateService::class)->publish(new PublishRateData($this->vip->id, BillingUnit::Day, 60000, 'Révision'));
        $this->travel(5)->minutes();

        $book = fn (string $at, string $date) => $this->actingAs($this->cashier)
            ->withHeaders($this->replayAt($at, 'reservation.create'))
            ->postJson('/api/v1/reservations', $this->payload(['start_date' => $date, 'end_date' => $date]))
            ->assertCreated()
            ->json('data.price.net_fcfa');

        $this->actingAs($this->cashier)->withHeaders($this->replayAt('2026-12-01 09:30', 'reservation.create'))
            ->postJson('/api/v1/reservations', $this->payload(['start_date' => '2026-12-02', 'end_date' => '2026-12-02']))
            ->assertStatus(409)->assertJsonPath('code', 'offline_rate_review');
        $this->assertSame(60000, $book('2026-12-01 10:02', '2026-12-03'), 'réservée après le changement');
        $this->assertSame(60000, $book('2026-12-01 11:00', '2026-12-04'), 'heure du poste dans le futur');
        $this->assertSame(60000, $book('2026-09-01 09:00', '2026-12-06'), 'heure trop ancienne');
        $this->flushHeaders();
        $this->assertSame(60000, $this->actingAs($this->cashier)
            ->postJson('/api/v1/reservations', $this->payload(['start_date' => '2026-12-07', 'end_date' => '2026-12-07']))
            ->assertCreated()->json('data.price.net_fcfa'), 'en ligne');

        // Confirmation faite hors ligne avant le changement : même règle.
        $this->actingAs($this->cashier)
            ->withHeaders($this->replayAt('2026-12-01 09:45', 'reservation.confirm'))
            ->postJson("/api/v1/reservations/{$pending}/confirm")
            ->assertStatus(409)
            ->assertJsonPath('code', 'offline_rate_review');
    }
}
