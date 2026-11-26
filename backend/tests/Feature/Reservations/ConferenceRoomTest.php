<?php

namespace Tests\Feature\Reservations;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomRate;
use App\Modules\RoomCatalog\Models\RoomType;
use App\Shared\Audit\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/** D-072 : salles de conférence réservées pour un événement, sans occupants. */
final class ConferenceRoomTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    private Room $hall;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
        $type = RoomType::query()->where('code', 'SALLE_CONFERENCE')->firstOrFail();
        $this->hall = Room::factory()->create(['number' => 'SALLE-A', 'room_type_id' => $type->id, 'capacity' => 80]);
        foreach ([[BillingUnit::Day, 150000], [BillingUnit::HalfDay, 90000]] as [$unit, $amount]) {
            RoomRate::factory()->create([
                'room_type_id' => $type->id, 'billing_unit' => $unit, 'amount_fcfa' => $amount,
                'effective_from' => now()->subMonth(),
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function event(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Atelier santé communautaire',
            'organizer_type' => 'NGO',
            'organization_name' => 'Santé pour tous',
            'contact_name' => 'Jean Yakité',
            'contact_phone' => '+236 75 11 22 33',
        ], $overrides);
    }

    /**
     * @param  array<string, mixed>  $event
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function hallBooking(array $event = [], array $overrides = []): array
    {
        return array_merge([
            'room_id' => $this->hall->uuid,
            'occupants' => [],
            'start_time' => '08:00',
            'end_time' => '17:00',
            'event' => $this->event($event),
        ], $overrides);
    }

    public function test_the_conference_category_exists_with_its_kind(): void
    {
        $types = $this->actingAs($this->admin)->getJson('/api/v1/room-types')->assertOk()->collect('data');

        $hall = $types->firstWhere('code', 'SALLE_CONFERENCE');
        $this->assertSame('Salle de conférence', $hall['label']);
        $this->assertSame('CONFERENCE', $hall['kind']);
        $this->assertSame('Salle de conférence', $hall['kind_label']);
        $this->assertSame('ROOM', $types->firstWhere('code', 'VIP')['kind']);
    }

    public function test_the_kind_is_chosen_at_creation_and_never_changed(): void
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/room-types', ['code' => 'AUDITORIUM', 'label' => 'Auditorium', 'kind' => 'CONFERENCE'])
            ->assertCreated()->assertJsonPath('data.kind', 'CONFERENCE')->json('data.id');
        $this->actingAs($this->admin)->postJson('/api/v1/room-types', ['code' => 'SUITE', 'label' => 'Suite'])
            ->assertCreated()->assertJsonPath('data.kind', 'ROOM');
        $this->actingAs($this->admin)->postJson('/api/v1/room-types', ['code' => 'BAD', 'label' => 'Mauvais', 'kind' => 'GARAGE'])
            ->assertStatus(422)->assertJsonValidationErrors(['kind']);

        $this->actingAs($this->admin)->patchJson("/api/v1/room-types/{$id}", ['kind' => 'ROOM'])
            ->assertStatus(422)->assertJsonValidationErrors(['kind']);
        $this->assertSame('CONFERENCE', RoomType::query()->where('code', 'AUDITORIUM')->firstOrFail()->kind->value);
    }

    public function test_a_conference_room_holds_up_to_a_thousand_places_a_bedroom_fifty(): void
    {
        $hallType = RoomType::query()->where('code', 'SALLE_CONFERENCE')->firstOrFail();
        $this->actingAs($this->admin)->postJson('/api/v1/rooms', ['number' => 'SALLE-B', 'room_type_id' => $hallType->uuid, 'capacity' => 200])
            ->assertCreated()->assertJsonPath('data.capacity', 200);
        $this->actingAs($this->admin)->postJson('/api/v1/rooms', ['number' => '103', 'room_type_id' => $this->vip->uuid, 'capacity' => 200])
            ->assertStatus(422)->assertJsonValidationErrors(['capacity']);
        $this->actingAs($this->admin)->patchJson("/api/v1/rooms/{$this->hall->uuid}", ['capacity' => 300])
            ->assertOk()->assertJsonPath('data.capacity', 300);
        $this->actingAs($this->admin)->patchJson("/api/v1/rooms/{$this->room101->uuid}", ['capacity' => 60])
            ->assertStatus(422)->assertJsonValidationErrors(['capacity']);
    }

    public function test_a_conference_room_is_booked_for_an_event_without_occupants(): void
    {
        $response = $this->book($this->hallBooking())->assertCreated()
            ->assertJsonPath('data.room.room_type.kind', 'CONFERENCE')
            ->assertJsonPath('data.event.name', 'Atelier santé communautaire')
            ->assertJsonPath('data.event.organizer_type', 'NGO')
            ->assertJsonPath('data.event.organizer_type_label', 'ONG')
            ->assertJsonPath('data.event.organization_name', 'Santé pour tous')
            ->assertJsonPath('data.event.contact_phone', '+236 75 11 22 33')
            ->assertJsonPath('data.occupants', [])
            ->assertJsonPath('data.price.net_fcfa', 150000);

        $id = (string) $response->json('data.id');
        $this->actingAs($this->cashier)->getJson("/api/v1/reservations/{$id}")->assertOk()
            ->assertJsonPath('data.event.name', 'Atelier santé communautaire');
        $this->actingAs($this->cashier)->getJson('/api/v1/reservations')->assertOk()
            ->assertJsonPath('data.0.event.organizer_type_label', 'ONG');
        $audit = AuditLog::query()->where('action', 'reservation.created')->firstOrFail();
        $this->assertSame('Atelier santé communautaire', $audit->after_json['event'] ?? null);

        // Une chambre ordinaire reste sans événement.
        $this->book()->assertCreated()->assertJsonPath('data.event', null);
    }

    public function test_event_and_room_kind_must_match_and_event_fields_are_validated(): void
    {
        $this->book(['room_id' => $this->hall->uuid])
            ->assertStatus(422)->assertJsonValidationErrors(['event.name']);
        $this->book(['event' => $this->event(), 'occupants' => []])
            ->assertStatus(422)->assertJsonValidationErrors(['event']);
        $this->book($this->hallBooking(['organization_name' => null]))
            ->assertStatus(422)->assertJsonValidationErrors(['event.organization_name']);
        $this->book($this->hallBooking(['organizer_type' => 'OTHER']))
            ->assertStatus(422)->assertJsonValidationErrors(['event.organizer_type_other']);
        $this->book($this->hallBooking(['organizer_type' => 'CLUB']))
            ->assertStatus(422)->assertJsonValidationErrors(['event.organizer_type']);
        $this->book($this->hallBooking(['contact_phone' => 'appeler Jean']))
            ->assertStatus(422)->assertJsonValidationErrors(['event.contact_phone']);
        $this->assertSame(0, Reservation::query()->count());

        // Un particulier n'a pas d'organisation ; « Autre » est précisé.
        $this->book($this->hallBooking(['organizer_type' => 'INDIVIDUAL', 'organization_name' => 'Ignorée']))
            ->assertCreated()->assertJsonPath('data.event.organization_name', null)
            ->assertJsonPath('data.event.organizer_type_label', 'Particulier');
        $this->book($this->hallBooking(['organizer_type' => 'OTHER', 'organizer_type_other' => 'Coopérative agricole'], ['start_date' => '2026-12-02', 'end_date' => '2026-12-02']))
            ->assertCreated()->assertJsonPath('data.event.organizer_type_label', 'Coopérative agricole');
    }

    public function test_the_invoice_shows_the_event_and_a_room_rental_line(): void
    {
        $this->book($this->hallBooking())->assertCreated();

        $snapshot = Invoice::query()->firstOrFail()->snapshot_json;
        $this->assertSame('CONFERENCE', $snapshot['room']['kind']);
        $this->assertSame('Atelier santé communautaire', $snapshot['event']['name']);
        $this->assertSame('ONG', $snapshot['event']['organizer']);
        $this->assertStringStartsWith('Location de salle — salle SALLE-A (Salle de conférence), journée — événement : Atelier santé communautaire', $snapshot['lines'][0]['label']);

        $ticket = view('billing.ticket', ['doc' => $snapshot, 'status' => 'ISSUED', 'qr' => 'data:image/png;base64,AA=='])->render();
        foreach (['Salle', 'Début', 'Événement', 'Atelier santé communautaire', 'ONG — Santé pour tous', 'Jean Yakité · +236 75 11 22 33', 'Merci pour votre confiance !'] as $text) {
            $this->assertStringContainsString($text, $ticket);
        }
        $this->assertStringNotContainsString('Merci pour votre séjour', $ticket);
        $this->assertStringNotContainsString('/verification/factures/', $ticket);
    }

    public function test_conference_rooms_are_counted_apart_from_bedrooms(): void
    {
        $this->book($this->hallBooking([], ['start_time' => '09:00', 'end_time' => '12:00', 'billing_unit' => 'HALF_DAY']))->assertCreated();

        $this->actingAs($this->admin)->getJson('/api/v1/reports/financial?from=2026-12-01&to=2026-12-01')->assertOk()
            ->assertJsonPath('data.occupancy.free', 2)
            ->assertJsonPath('data.occupancy.reserved', 0)
            ->assertJsonPath('data.occupancy.conference.free', 0)
            ->assertJsonPath('data.occupancy.conference.reserved', 1);
    }

    public function test_an_event_stays_in_a_conference_room_when_modified(): void
    {
        $id = (string) $this->book($this->hallBooking([], ['start_date' => '2026-12-03', 'end_date' => '2026-12-03']))
            ->assertCreated()->json('data.id');

        $this->actingAs($this->admin)->postJson("/api/v1/reservations/{$id}/modification/preview", [
            'room_id' => $this->room102->uuid, 'start_date' => '2026-12-03', 'end_date' => '2026-12-03',
            'billing_unit' => 'DAY', 'quantity' => 1,
        ])->assertStatus(409)->assertJsonPath('code', 'room_kind_mismatch');
    }
}
