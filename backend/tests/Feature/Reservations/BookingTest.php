<?php

namespace Tests\Feature\Reservations;

use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Application\Services\RateService;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\DTO\PublishRateData;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class BookingTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    public function test_cashier_books_a_room_with_frozen_price_occupants_and_audit(): void
    {
        $id = $this->book()
            ->assertCreated()
            ->assertJsonPath('data.status', 'CONFIRMED')
            ->assertJsonPath('data.status_label', 'Confirmée')
            ->assertJsonPath('data.room.number', '101')
            ->assertJsonPath('data.room.id', $this->room101->uuid)
            ->assertJsonPath('data.customer.full_name', 'NGAÏKOSSET Awa')
            ->assertJsonPath('data.price.unit_price_fcfa', 50000)
            ->assertJsonPath('data.price.gross_fcfa', 50000)
            ->assertJsonPath('data.price.net_fcfa', 50000)
            ->assertJsonPath('data.period.blocked_from', '2026-12-01T00:00:00+01:00')
            ->assertJsonPath('data.period.blocked_until', '2026-12-02T00:00:00+01:00')
            ->assertJsonPath('data.period.is_estimated', true)
            ->assertJsonPath('data.occupants.0.name', 'Awa Ngaïkosset')
            ->assertJsonPath('data.occupants.0.is_primary', true)
            ->json('data.id');

        $reservation = Reservation::query()->where('uuid', $id)->firstOrFail();
        $vipDay = RoomRate::query()->where('room_type_id', $this->vip->id)->where('billing_unit', 'DAY')->firstOrFail();
        $this->assertSame($vipDay->id, $reservation->rate_id);
        $this->assertSame($this->cashier->id, $reservation->created_by);
        $this->assertSame(1, AuditLog::query()->where('action', 'reservation.created')->where('entity_id', $reservation->id)->count());
    }

    /** Critère d'acceptation : 2 occupants paient le même tarif qu'un seul, si la capacité est respectée. */
    public function test_price_is_per_room_and_capacity_is_enforced(): void
    {
        $this->book(['occupants' => [['name' => 'Awa'], ['name' => 'Jean']]])
            ->assertCreated()
            ->assertJsonPath('data.price.net_fcfa', 50000)
            ->assertJsonCount(2, 'data.occupants');

        $this->book(['start_date' => '2026-12-05', 'end_date' => '2026-12-05', 'occupants' => [['name' => 'A'], ['name' => 'B'], ['name' => 'C']]])
            ->assertStatus(422)
            ->assertJsonPath('code', 'capacity_exceeded')
            ->assertJsonPath('title', 'Capacité dépassée');
    }

    /** Critère d'acceptation : une chambre en maintenance n'est pas réservable. */
    public function test_room_under_maintenance_cannot_be_booked(): void
    {
        $this->room101->forceFill(['maintenance_status' => 'MAINTENANCE'])->save();

        $this->book()->assertStatus(409)->assertJsonPath('code', 'room_under_maintenance');
        $this->assertSame(0, Reservation::query()->count());
    }

    /** Recette 3 : période chevauchante refusée ; période libre acceptée. */
    public function test_overlapping_period_is_refused_and_free_period_accepted(): void
    {
        $this->bookOk();

        $this->book(['start_time' => '14:00', 'end_time' => '18:00'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'room_unavailable')
            ->assertJsonPath('title', 'Chambre indisponible')
            ->assertJsonPath('details.0', 'Confirmée du 01/12/2026 00:00 au 02/12/2026 00:00.');

        $this->book(['start_date' => '2026-12-02', 'end_date' => '2026-12-02'])->assertCreated();
        $this->book(['room_id' => $this->room102->uuid])->assertCreated();
    }

    /** D-009 (provisoire) : sans heures, deux demi-journées le même jour sont en conflit ; avec heures, non. */
    public function test_same_day_half_days_depend_on_known_hours(): void
    {
        $this->bookOk(['billing_unit' => 'HALF_DAY', 'start_time' => '08:00', 'end_time' => '12:00']);
        $this->bookOk(['billing_unit' => 'HALF_DAY', 'start_time' => '13:00', 'end_time' => '20:00']);
        $this->book(['billing_unit' => 'HALF_DAY', 'start_time' => '11:00', 'end_time' => '14:00'])
            ->assertStatus(409);

        $this->bookOk(['room_id' => $this->room102->uuid, 'billing_unit' => 'HALF_DAY']);
        $this->book(['room_id' => $this->room102->uuid, 'billing_unit' => 'HALF_DAY', 'start_time' => '18:00', 'end_time' => '22:00'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'room_unavailable');
    }

    /** Règle validée : demi-journée ≤ 12 h incluses ; au-delà, validation explicite ; pas de conversion. */
    public function test_half_day_overrun_requires_an_explicit_supplement(): void
    {
        $this->book(['billing_unit' => 'HALF_DAY', 'start_time' => '08:00', 'end_time' => '20:00'])
            ->assertCreated()
            ->assertJsonPath('data.price.net_fcfa', 30000);

        $this->book(['room_id' => $this->room102->uuid, 'billing_unit' => 'HALF_DAY', 'start_time' => '08:00', 'end_time' => '21:30'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'half_day_overrun')
            ->assertJsonPath('details.0', 'Durée de la période : 13 h 30.')
            ->assertJsonPath('details.2', 'Quantité nécessaire : 2.')
            ->assertJsonPath('details.3', 'Supplément proposé : +20 000 FCFA (brut 40 000 FCFA).');

        $this->book(['room_id' => $this->room102->uuid, 'billing_unit' => 'HALF_DAY', 'quantity' => 2, 'start_time' => '08:00', 'end_time' => '21:30'])
            ->assertCreated()
            ->assertJsonPath('data.price.billing_unit', 'HALF_DAY')
            ->assertJsonPath('data.price.quantity', 2)
            ->assertJsonPath('data.price.gross_fcfa', 40000);
    }

    /** Critère d'acceptation : 10 % sur 50 000 donne 45 000 ; utilisateur et motif enregistrés. */
    public function test_ten_percent_discount_is_recorded_with_author_and_reason(): void
    {
        $id = $this->book(['discount' => ['type' => 'PERCENT', 'value' => 10, 'reason' => 'Client fidèle']])
            ->assertCreated()
            ->assertJsonPath('data.price.gross_fcfa', 50000)
            ->assertJsonPath('data.price.discount_fcfa', 5000)
            ->assertJsonPath('data.price.net_fcfa', 45000)
            ->assertJsonPath('data.price.discount.value', '10 %')
            ->assertJsonPath('data.price.discount.reason', 'Client fidèle')
            ->json('data.id');

        $reservation = Reservation::query()->where('uuid', $id)->firstOrFail();
        $this->assertSame($this->cashier->id, $reservation->discount_by);
        $this->assertSame('10.00', $reservation->discount_value);
    }

    public function test_discount_cap_and_permissions_are_enforced(): void
    {
        $this->book(['discount' => ['type' => 'PERCENT', 'value' => 15, 'reason' => 'Geste commercial']])
            ->assertStatus(403)
            ->assertJsonPath('code', 'discount_cap_exceeded');

        $this->book(['discount' => ['type' => 'PERCENT', 'value' => 15, 'reason' => 'Geste commercial']], $this->admin)
            ->assertCreated()
            ->assertJsonPath('data.price.net_fcfa', 42500);

        Role::findByName('caissiere', 'web')->revokePermissionTo('discounts.apply');
        $this->book(['start_date' => '2026-12-03', 'end_date' => '2026-12-03', 'discount' => ['type' => 'FIXED', 'value' => 1000, 'reason' => 'x']])
            ->assertStatus(403)
            ->assertJsonPath('code', 'discount_not_allowed');
    }

    public function test_discount_payload_is_validated(): void
    {
        $this->book(['discount' => ['type' => 'FIXED', 'value' => 5000, 'reason' => 'Arrondi']], $this->admin)
            ->assertCreated()->assertJsonPath('data.price.net_fcfa', 45000);

        $this->book(['start_date' => '2026-12-02', 'end_date' => '2026-12-02', 'discount' => ['type' => 'FIXED', 'value' => 60000, 'reason' => 'x']], $this->admin)
            ->assertStatus(422)->assertJsonPath('code', 'discount_exceeds_amount');
        $this->book(['discount' => ['type' => 'PERCENT', 'value' => 10]])
            ->assertStatus(422)->assertJsonValidationErrors(['discount.reason']);
        $this->book(['discount' => ['type' => 'PERCENT', 'value' => 150, 'reason' => 'x']])
            ->assertStatus(422)->assertJsonValidationErrors(['discount.value']);
        $this->book(['discount' => ['type' => 'FIXED', 'value' => 10.5, 'reason' => 'x']])
            ->assertStatus(422)->assertJsonValidationErrors(['discount.value']);
    }

    /** Critère d'acceptation : 50 000 → 60 000 ; l'ancienne réservation reste à 50 000, la nouvelle utilise 60 000. */
    public function test_new_rate_applies_to_new_bookings_only(): void
    {
        $oldId = $this->bookOk();

        app(RateService::class)->publish(new PublishRateData($this->vip->id, BillingUnit::Day, 60000, 'Révision'));

        $this->book(['start_date' => '2026-12-03', 'end_date' => '2026-12-03'])
            ->assertCreated()
            ->assertJsonPath('data.price.net_fcfa', 60000);
        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$oldId}")
            ->assertJsonPath('data.price.net_fcfa', 50000);
    }

    public function test_quote_computes_price_and_availability_without_saving(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/reservations/quote', $this->payload(['customer_id' => null, 'discount' => ['type' => 'PERCENT', 'value' => '7.5', 'reason' => 'Promo']]))
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.price.discount_fcfa', 3750)
            ->assertJsonPath('data.price.net_fcfa', 46250);
        $this->assertSame(0, Reservation::query()->count());

        $this->bookOk();
        $this->actingAs($this->cashier)->postJson('/api/v1/reservations/quote', $this->payload())
            ->assertOk()
            ->assertJsonPath('data.available', false)
            ->assertJsonCount(1, 'data.conflicts');
    }

    public function test_period_and_references_are_validated_in_french(): void
    {
        $this->book(['start_date' => '2026-11-30', 'end_date' => '2026-11-30'])
            ->assertStatus(422)
            ->assertJsonPath('errors.start_date.0', "La date d'arrivée ne peut pas être passée.");
        $this->book(['start_date' => '2026-12-03', 'end_date' => '2026-12-02'])
            ->assertStatus(422)->assertJsonValidationErrors(['end_date']);
        $this->book(['start_time' => '15:00', 'end_time' => '09:00'])
            ->assertStatus(422)->assertJsonPath('code', 'invalid_period');
        $this->book(['room_id' => $this->room101->id, 'customer_id' => $this->customer->id])
            ->assertStatus(422)->assertJsonValidationErrors(['room_id', 'customer_id']);
        $this->book(['occupants' => [['name' => 'A', 'is_primary' => true], ['name' => 'B', 'is_primary' => true]]])
            ->assertStatus(422)->assertJsonPath('errors.occupants.0', 'Un seul occupant peut être désigné comme principal.');
    }

    public function test_pending_reservation_blocks_the_room_and_is_priced_at_confirmation(): void
    {
        $id = $this->book(['confirm' => false])->assertCreated()->assertJsonPath('data.status', 'PENDING')->json('data.id');
        $this->book(['room_id' => $this->room101->uuid])->assertStatus(409);

        app(RateService::class)->publish(new PublishRateData($this->vip->id, BillingUnit::Day, 60000, 'Révision'));

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/confirm")
            ->assertOk()
            ->assertJsonPath('data.status', 'CONFIRMED')
            ->assertJsonPath('data.price.net_fcfa', 60000);

        $audit = AuditLog::query()->where('action', 'reservation.confirmed')->firstOrFail();
        $this->assertSame(50000, $audit->before_json['net_fcfa'] ?? null);
        $this->assertSame(60000, $audit->after_json['net_fcfa'] ?? null);

        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/confirm")
            ->assertStatus(409)->assertJsonPath('code', 'invalid_reservation_status');
    }

    public function test_permissions_and_uuid_routes(): void
    {
        Role::findByName('caissiere', 'web')->revokePermissionTo('reservations.create');
        $this->book()->assertStatus(403)->assertJsonPath('title', 'Accès refusé');

        $id = $this->bookOk(as: $this->admin);
        $reservation = Reservation::query()->where('uuid', $id)->firstOrFail();
        $this->actingAs($this->admin)->getJson("/api/v1/reservations/{$reservation->id}")->assertNotFound();
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/v1/reservations/{$id}")->assertStatus(401);
    }
}
