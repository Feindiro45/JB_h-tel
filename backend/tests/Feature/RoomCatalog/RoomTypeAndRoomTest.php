<?php

namespace Tests\Feature\RoomCatalog;

use App\Modules\Identity\Models\User;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomType;
use App\Shared\Audit\AuditLog;
use Database\Seeders\RolesAndPermissionsSeeder;
use Database\Seeders\RoomTypesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoomTypeAndRoomTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $cashier;

    private RoomType $vip;

    private RoomType $standard;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolesAndPermissionsSeeder::class, RoomTypesSeeder::class]);
        $this->admin = User::factory()->admin()->create();
        $this->cashier = User::factory()->cashier()->create();
        $this->vip = RoomType::query()->where('code', 'VIP')->firstOrFail();
        $this->standard = RoomType::query()->where('code', 'STANDARD')->firstOrFail();
    }

    public function test_reference_room_types_are_seeded_idempotently(): void
    {
        $this->seed(RoomTypesSeeder::class);

        // VIP, Standard et la salle de conférence (D-072), sans doublon au second passage.
        $types = $this->actingAs($this->cashier)
            ->getJson('/api/v1/room-types')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->collect('data')
            ->keyBy('code');
        $this->assertSame($this->vip->uuid, $types['VIP']['id']);
        $this->assertSame('Standard', $types['STANDARD']['label']);
        $this->assertSame('CONFERENCE', $types['SALLE_CONFERENCE']['kind']);
    }

    public function test_admin_creates_and_renames_a_room_type_but_cannot_change_its_code(): void
    {
        $id = $this->actingAs($this->admin)
            ->postJson('/api/v1/room-types', ['code' => 'suite', 'label' => 'Suite'])
            ->assertCreated()
            ->assertJsonPath('data.code', 'SUITE')
            ->json('data.id');

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/room-types/{$id}", ['label' => 'Suite présidentielle'])
            ->assertOk()
            ->assertJsonPath('data.label', 'Suite présidentielle');

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/room-types/{$id}", ['code' => 'AUTRE'])
            ->assertStatus(422)
            ->assertJsonPath('errors.code.0', "Le code d'un type de chambre ne peut pas être modifié.");

        $this->actingAs($this->admin)
            ->postJson('/api/v1/room-types', ['code' => 'VIP', 'label' => 'Doublon'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['code']);
    }

    /** Recette 1 : créer 101 VIP et 102 Standard ; les numéros sont uniques. */
    public function test_admin_creates_rooms_with_unique_numbers(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/rooms', ['number' => ' 101 ', 'room_type_id' => $this->vip->uuid, 'capacity' => 2])
            ->assertCreated()
            ->assertJsonPath('data.number', '101')
            ->assertJsonPath('data.room_type.code', 'VIP')
            ->assertJsonPath('data.maintenance_status', 'AVAILABLE');

        $this->actingAs($this->admin)
            ->postJson('/api/v1/rooms', ['number' => '102', 'room_type_id' => $this->standard->uuid, 'capacity' => 2])
            ->assertCreated()
            ->assertJsonPath('data.room_type.code', 'STANDARD');

        $this->actingAs($this->admin)
            ->postJson('/api/v1/rooms', ['number' => '101', 'room_type_id' => $this->standard->uuid, 'capacity' => 1])
            ->assertStatus(422)
            ->assertJsonPath('errors.number.0', 'Une chambre porte déjà ce numéro.');

        $this->assertSame(2, Room::query()->count());
        $this->assertSame(2, AuditLog::query()->where('action', 'room.created')->count());
    }

    public function test_room_validation_is_in_french_and_references_types_by_uuid(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/rooms', ['number' => '10 1', 'room_type_id' => $this->vip->id, 'capacity' => 0])
            ->assertStatus(422)
            ->assertJsonPath('title', 'Données invalides')
            ->assertJsonValidationErrors(['number', 'room_type_id', 'capacity']);
    }

    public function test_rooms_are_listed_in_natural_order_with_search_and_filters(): void
    {
        foreach (['101' => $this->vip, '9' => $this->standard, '10' => $this->standard, '002' => $this->standard, '001' => $this->vip] as $number => $type) {
            Room::factory()->create(['number' => (string) $number, 'room_type_id' => $type->id]);
        }
        Room::query()->where('number', '10')->update(['maintenance_status' => 'MAINTENANCE']);

        $numbers = fn (string $query): array => array_column(
            (array) $this->actingAs($this->cashier)->getJson("/api/v1/rooms{$query}")->assertOk()->json('data'),
            'number',
        );

        $this->assertSame(['9', '10', '001', '002', '101'], $numbers(''));
        $this->assertSame(['001', '101'], $numbers("?room_type_id={$this->vip->uuid}"));
        $this->assertSame(['10'], $numbers('?maintenance_status=MAINTENANCE'));
        $this->assertSame(['10', '101'], $numbers('?search=10'));
    }

    public function test_admin_updates_a_room_and_toggles_maintenance_with_audit(): void
    {
        $room = Room::factory()->create(['number' => '101', 'room_type_id' => $this->vip->id, 'capacity' => 2]);

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/rooms/{$room->uuid}", ['capacity' => 3, 'room_type_id' => $this->standard->uuid])
            ->assertOk()
            ->assertJsonPath('data.capacity', 3)
            ->assertJsonPath('data.room_type.code', 'STANDARD');

        $this->actingAs($this->admin)
            ->putJson("/api/v1/rooms/{$room->uuid}/maintenance", ['status' => 'MAINTENANCE', 'note' => 'Fuite d’eau'])
            ->assertOk()
            ->assertJsonPath('data.maintenance_status', 'MAINTENANCE')
            ->assertJsonPath('data.maintenance_label', 'En maintenance')
            ->assertJsonPath('data.maintenance_note', 'Fuite d’eau');

        $this->actingAs($this->admin)
            ->putJson("/api/v1/rooms/{$room->uuid}/maintenance", ['status' => 'AVAILABLE', 'note' => 'ignorée'])
            ->assertOk()
            ->assertJsonPath('data.maintenance_status', 'AVAILABLE')
            ->assertJsonPath('data.maintenance_note', null);

        $audit = AuditLog::query()->where('action', 'room.maintenance_changed')->orderBy('id')->firstOrFail();
        $this->assertSame('AVAILABLE', $audit->before_json['maintenance_status'] ?? null);
        $this->assertSame('MAINTENANCE', $audit->after_json['maintenance_status'] ?? null);
    }

    public function test_cashier_can_view_but_not_manage_rooms(): void
    {
        $room = Room::factory()->create(['room_type_id' => $this->vip->id]);

        $this->actingAs($this->cashier)->getJson("/api/v1/rooms/{$room->uuid}")->assertOk();
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/rooms', ['number' => '300', 'room_type_id' => $this->vip->uuid, 'capacity' => 2])
            ->assertStatus(403)
            ->assertJsonPath('title', 'Accès refusé');
        $this->actingAs($this->cashier)
            ->putJson("/api/v1/rooms/{$room->uuid}/maintenance", ['status' => 'MAINTENANCE'])
            ->assertStatus(403);
    }

    public function test_room_routes_only_accept_uuids(): void
    {
        $room = Room::factory()->create(['room_type_id' => $this->vip->id]);

        $this->actingAs($this->cashier)->getJson("/api/v1/rooms/{$room->id}")->assertNotFound();
        $this->actingAs($this->cashier)->getJson("/api/v1/rooms/{$room->uuid}")
            ->assertOk()
            ->assertJsonPath('data.id', $room->uuid)
            ->assertJsonPath('data.room_type.id', $this->vip->uuid);
    }

    public function test_guest_cannot_access_the_catalogue(): void
    {
        $this->getJson('/api/v1/rooms')->assertStatus(401);
    }
}
