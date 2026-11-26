<?php

namespace Tests\Feature\Reservations;

use App\Modules\Customers\Models\Customer;
use App\Modules\Identity\Models\User;
use App\Modules\Notifications\Mail\StayMail;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomType;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * D-058 (demande du 20/11/2026) : la caissière corrige une réservation avant le séjour ;
 * l'administrateur seul supprime définitivement une saisie faite par erreur, avec un motif et une
 * copie au journal. L'argent et les pièces comptables ne se suppriment jamais.
 */
class CorrectionsTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
        Mail::fake();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function change(array $overrides = []): array
    {
        return array_merge([
            'room_id' => $this->room102->uuid, 'start_date' => '2026-12-02', 'end_date' => '2026-12-04',
            'billing_unit' => 'DAY', 'quantity' => 2, 'reason' => 'Mauvaise chambre et mauvaises dates saisies',
        ], $overrides);
    }

    public function test_cashier_corrects_room_dates_and_price_before_the_stay(): void
    {
        $this->customer->forceFill(['email' => 'awa@exemple.cf'])->save();
        $reservation = $this->bookLegacyUninvoiced(); // Ancien séjour sans facture : correction par la caissière.

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/modification/preview", $this->change(['reason' => null]))
            ->assertOk()
            ->assertJsonPath('data.price.net_fcfa', 60000)
            ->assertJsonPath('data.current_net_fcfa', 50000)
            ->assertJsonPath('data.available', true);

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/modification", $this->change())
            ->assertOk()
            ->assertJsonPath('data.room.number', '102')
            ->assertJsonPath('data.period.start_date', '2026-12-02')
            ->assertJsonPath('data.period.end_date', '2026-12-04')
            ->assertJsonPath('data.price.unit_price_fcfa', 30000)
            ->assertJsonPath('data.price.net_fcfa', 60000)
            ->assertJsonPath('meta.replacement_invoice_number', null);

        $audit = AuditLog::query()->where('action', 'reservation.modified')->sole();
        $this->assertSame('Mauvaise chambre et mauvaises dates saisies', $audit->after_json['reason'] ?? null);
        $this->assertSame(50000, $audit->before_json['net_fcfa'] ?? null);
        Mail::assertSent(StayMail::class, fn (StayMail $mail) => $mail->message->kind === 'reservation.modified');
    }

    public function test_modification_rechecks_availability_and_requires_a_reason(): void
    {
        $reservation = $this->bookLegacyUninvoiced();
        $this->bookOk(['room_id' => $this->room102->uuid, 'start_date' => '2026-12-03', 'end_date' => '2026-12-03']);

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/modification/preview", $this->change(['reason' => null]))
            ->assertOk()->assertJsonPath('data.available', false);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/modification", $this->change())
            ->assertStatus(409)->assertJsonPath('code', 'room_unavailable');
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/modification", $this->change(['room_id' => $this->room101->uuid, 'reason' => '']))
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->assertSame($this->room101->id, Reservation::query()->where('uuid', $reservation)->firstOrFail()->room_id);
    }

    public function test_started_invoiced_or_overpaid_reservations_are_protected(): void
    {
        $started = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$started}/check-in")->assertOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$started}/modification", $this->change())
            ->assertStatus(409)->assertJsonPath('code', 'reservation_not_modifiable');

        $invoiced = $this->bookOk(['start_date' => '2026-12-10', 'end_date' => '2026-12-10']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$invoiced}/invoices")->assertCreated();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$invoiced}/modification", $this->change(['start_date' => '2026-12-12', 'end_date' => '2026-12-12', 'quantity' => 1]))
            ->assertStatus(403)->assertJsonPath('code', 'modification_requires_admin');
        $this->actingAs($this->admin)->postJson("/api/v1/reservations/{$invoiced}/modification", $this->change(['start_date' => '2026-12-12', 'end_date' => '2026-12-12', 'quantity' => 1]))
            ->assertOk()->assertJsonPath('meta.replacement_invoice_number', 'FAC-2026-000003');

        $paid = $this->bookLegacyUninvoiced(['start_date' => '2026-12-20', 'end_date' => '2026-12-20']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$paid}/payments", ['amount_fcfa' => 50000, 'method' => 'CASH'])->assertCreated();
        // Chambre Standard : 30 000 < 50 000 déjà encaissés.
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$paid}/modification", $this->change(['start_date' => '2026-12-20', 'end_date' => '2026-12-20', 'quantity' => 1]))
            ->assertStatus(409)->assertJsonPath('code', 'modification_below_collected');
    }

    public function test_only_the_admin_deletes_and_each_deletion_keeps_a_full_copy_in_the_audit(): void
    {
        $customer = Customer::factory()->create(['name' => 'DOUBLON', 'first_name' => 'Saisie']);

        $this->actingAs($this->cashier)->deleteJson("/api/v1/customers/{$customer->uuid}", ['reason' => 'Doublon'])->assertForbidden();
        $this->actingAs($this->admin)->deleteJson("/api/v1/customers/{$customer->uuid}", [])
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->actingAs($this->admin)->deleteJson("/api/v1/customers/{$customer->uuid}", ['reason' => 'Doublon de NGAÏKOSSET'])
            ->assertOk()->assertJsonPath('message', 'Fiche client supprimée. Une copie est conservée dans le journal d’audit.');

        $this->assertNull(Customer::query()->find($customer->id));
        $audit = AuditLog::query()->where('action', 'customer.deleted')->sole();
        $this->assertSame('DOUBLON', $audit->before_json['name'] ?? null);
        $this->assertSame('Doublon de NGAÏKOSSET', $audit->after_json['reason'] ?? null);
        $this->assertSame($this->admin->id, $audit->actor_id);
    }

    public function test_customers_with_stays_and_reservations_with_money_or_documents_are_kept(): void
    {
        $reservation = $this->bookLegacyUninvoiced();
        $this->actingAs($this->admin)->deleteJson("/api/v1/customers/{$this->customer->uuid}", ['reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'customer_has_stays');

        $paid = $this->bookOk(['start_date' => '2026-12-05', 'end_date' => '2026-12-05']);
        $payment = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$paid}/payments", ['amount_fcfa' => 1000, 'method' => 'CASH'])->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/payments/{$payment}/cancel", ['reason' => 'Erreur'])->assertOk();
        $this->actingAs($this->admin)->deleteJson("/api/v1/reservations/{$paid}", ['reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'reservation_has_payments');

        $invoiced = $this->bookOk(['start_date' => '2026-12-07', 'end_date' => '2026-12-07']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$invoiced}/invoices")->assertCreated();
        $this->actingAs($this->admin)->deleteJson("/api/v1/reservations/{$invoiced}", ['reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'reservation_has_invoices');

        $this->actingAs($this->cashier)->deleteJson("/api/v1/reservations/{$reservation}", ['reason' => 'x'])->assertForbidden();
        $this->actingAs($this->admin)->deleteJson("/api/v1/reservations/{$reservation}", ['reason' => 'Saisie en double'])->assertOk();
        $this->assertNull(Reservation::query()->where('uuid', $reservation)->first());
        $audit = AuditLog::query()->where('action', 'reservation.deleted')->sole();
        $this->assertSame(['Awa Ngaïkosset'], $audit->before_json['occupants'] ?? null);
    }

    public function test_rooms_categories_and_unused_accounts(): void
    {
        $this->bookOk();
        $this->actingAs($this->admin)->deleteJson("/api/v1/rooms/{$this->room101->uuid}", ['reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'room_in_use');
        $spare = Room::factory()->create(['number' => '999', 'room_type_id' => $this->vip->id]);
        $this->actingAs($this->admin)->deleteJson("/api/v1/rooms/{$spare->uuid}", ['reason' => 'Numéro erroné'])->assertOk();
        $this->assertNull(Room::query()->find($spare->id));

        $this->actingAs($this->admin)->deleteJson("/api/v1/room-types/{$this->standard->uuid}", ['reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'room_type_has_rooms');
        $empty = RoomType::query()->create(['code' => 'SUITE', 'label' => 'Suite']);
        $this->actingAs($this->admin)->deleteJson("/api/v1/room-types/{$empty->uuid}", ['reason' => 'Créée par erreur'])->assertOk();

        $this->actingAs($this->admin)->deleteJson("/api/v1/users/{$this->admin->uuid}", ['reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'cannot_delete_self');
        $used = User::factory()->cashier()->create(['last_login_at' => now()]);
        $this->actingAs($this->admin)->deleteJson("/api/v1/users/{$used->uuid}", ['reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'user_has_activity');
        // Filet de sécurité : jamais connecté, mais auteur d'une réservation (clé étrangère).
        $this->actingAs($this->admin)->deleteJson("/api/v1/users/{$this->cashier->uuid}", ['reason' => 'x'])
            ->assertStatus(409)->assertJsonPath('code', 'record_in_use');
        $this->assertNotNull(User::query()->find($this->cashier->id));
        $this->assertSame(0, AuditLog::query()->where('action', 'user.deleted')->count());

        $unused = User::factory()->cashier()->create(['name' => 'Compte en trop']);
        $this->actingAs($this->admin)->deleteJson("/api/v1/users/{$unused->uuid}", ['reason' => 'Créé par erreur'])->assertOk();
        $this->assertNull(User::query()->find($unused->id));
        $this->assertSame('Compte en trop', AuditLog::query()->where('action', 'user.deleted')->sole()->before_json['name'] ?? null);
    }

    public function test_the_delete_permission_is_reserved_to_the_admin_role(): void
    {
        $listed = $this->actingAs($this->admin)->getJson('/api/v1/permissions')->assertOk()->collect('data')->pluck('name');
        $this->assertNotContains('records.delete', $listed);
        $this->assertTrue($this->admin->can('records.delete'));
        $this->assertFalse($this->cashier->can('records.delete'));

        $this->actingAs($this->admin)->putJson('/api/v1/roles/caissiere/permissions', ['permissions' => ['reservations.view', 'records.delete']])
            ->assertStatus(409)->assertJsonPath('code', 'permission_admin_only');
    }
}
