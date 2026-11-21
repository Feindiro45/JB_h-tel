<?php

namespace Tests\Feature\Shared;

use App\Modules\Cashier\Models\Payment;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Models\Reservation;
use App\Shared\Idempotency\IdempotencyRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * Lot 3 : une écriture rejouée avec la même clé `Idempotency-Key` ne crée jamais de doublon
 * (double clic, réseau instable, future synchronisation hors ligne).
 */
class IdempotencyTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    private string $reservation;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
        $this->reservation = $this->bookOk(); // 101 VIP, une journée : 50 000 FCFA
    }

    /** @return TestResponse<Response> */
    private function pay(?string $key, int $amount = 20000, ?User $as = null): TestResponse
    {
        $this->flushHeaders();

        return $this->actingAs($as ?? $this->cashier)
            ->withHeaders($key === null ? [] : ['Idempotency-Key' => $key])
            ->postJson("/api/v1/reservations/{$this->reservation}/payments", ['amount_fcfa' => $amount, 'method' => 'CASH']);
    }

    public function test_a_replayed_payment_returns_the_same_receipt_and_is_recorded_once(): void
    {
        $key = (string) Str::uuid();

        $first = $this->pay($key)->assertCreated()->assertHeaderMissing('Idempotent-Replayed');
        $second = $this->pay($key)->assertCreated()->assertHeader('Idempotent-Replayed', 'true');

        $this->assertSame($first->json('data.receipt_number'), $second->json('data.receipt_number'));
        $this->assertSame($first->json(), $second->json());
        $this->assertSame(1, Payment::query()->count());
        // Avance de 20 000 sur 50 000 : le solde reste 30 000, même après le rejeu.
        $this->actingAs($this->cashier)->getJson('/api/v1/payments/'.$first->json('data.id'))
            ->assertJsonPath('data.summary.balance_fcfa', 30000);
        $this->assertSame(1, IdempotencyRecord::query()->count());
    }

    public function test_the_same_key_with_other_values_is_refused_in_french(): void
    {
        $key = (string) Str::uuid();
        $this->pay($key, 20000)->assertCreated();

        $this->pay($key, 25000)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'idempotency_key_reused')
            ->assertJsonPath('title', 'Opération déjà enregistrée');
        $this->assertSame(1, Payment::query()->count());
    }

    public function test_a_failed_attempt_is_never_memorised_and_the_key_can_be_retried(): void
    {
        $key = (string) Str::uuid();

        // Trop-perçu refusé (D-014) : rien n'est enregistré, ni l'encaissement ni la clé.
        $this->pay($key, 60000)->assertUnprocessable();
        $this->assertSame(0, IdempotencyRecord::query()->count());

        $this->pay($key, 50000)->assertCreated()->assertHeaderMissing('Idempotent-Replayed');
        $this->assertSame(1, Payment::query()->count());
    }

    public function test_keys_are_scoped_to_each_user_and_optional(): void
    {
        $key = (string) Str::uuid();
        $this->pay($key, 10000)->assertCreated();
        $this->pay($key, 10000, $this->admin)->assertCreated()->assertHeaderMissing('Idempotent-Replayed');

        // Sans en-tête : fonctionnement habituel, chaque envoi est une nouvelle opération.
        $this->pay(null, 1000)->assertCreated();
        $this->pay(null, 1000)->assertCreated();
        $this->assertSame(4, Payment::query()->count());

        $this->pay('pas-une-cle', 1000)->assertUnprocessable()->assertJsonPath('code', 'idempotency_key_invalid');
    }

    public function test_a_replayed_booking_does_not_create_a_second_reservation_or_a_conflict(): void
    {
        $key = (string) Str::uuid();
        $payload = $this->payload(['start_date' => '2026-12-05', 'end_date' => '2026-12-05']);
        $book = fn () => $this->flushHeaders()->actingAs($this->cashier)
            ->withHeaders(['Idempotency-Key' => $key])
            ->postJson('/api/v1/reservations', $payload);

        $first = $book()->assertCreated();
        // Sans la clé, la même chambre aux mêmes dates serait refusée (409) : ici, la réponse est rejouée.
        $book()->assertCreated()->assertHeader('Idempotent-Replayed', 'true')->assertJsonPath('data.id', $first->json('data.id'));
        $this->assertSame(2, Reservation::query()->count());
    }

    public function test_old_responses_are_pruned_after_thirty_days(): void
    {
        $this->pay((string) Str::uuid())->assertCreated();
        $this->travel(IdempotencyRecord::RETENTION_DAYS + 1)->days();
        $this->pay((string) Str::uuid(), 1000)->assertCreated();

        $this->artisan('model:prune', ['--model' => [IdempotencyRecord::class]])->assertSuccessful();
        $this->assertSame(1, IdempotencyRecord::query()->count());
    }
}
