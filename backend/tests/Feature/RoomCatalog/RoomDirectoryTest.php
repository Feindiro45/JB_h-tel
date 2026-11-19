<?php

namespace Tests\Feature\RoomCatalog;

use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomType;
use Database\Seeders\DemoCatalogSeeder;
use Database\Seeders\RoomTypesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Contrat public `RoomDirectory`, consommé par le module Reservations (phase 4). */
class RoomDirectoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_directory_exposes_room_snapshots_by_id_and_uuid(): void
    {
        $vip = RoomType::factory()->vip()->create();
        $room = Room::factory()->underMaintenance()->create(['number' => '101', 'room_type_id' => $vip->id, 'capacity' => 2]);
        $directory = app(RoomDirectory::class);

        $snapshot = $directory->findByUuid($room->uuid);
        $this->assertNotNull($snapshot);
        $this->assertSame($room->id, $snapshot->id);
        $this->assertSame('101', $snapshot->number);
        $this->assertSame('VIP', $snapshot->roomTypeCode);
        $this->assertSame(2, $snapshot->capacity);
        $this->assertTrue($snapshot->underMaintenance);

        $this->assertEquals($snapshot, $directory->find($room->id));
        $this->assertNull($directory->findByUuid('pas-un-uuid'));
        $this->assertNull($directory->find(999999));
    }

    public function test_demo_catalogue_is_idempotent_and_sorted(): void
    {
        $this->seed([RoomTypesSeeder::class, DemoCatalogSeeder::class]);
        $this->seed(DemoCatalogSeeder::class);

        $numbers = array_map(fn ($snapshot) => $snapshot->number, app(RoomDirectory::class)->all());
        $this->assertSame(['001', '002', '101', '102', '201'], $numbers);
        $this->assertSame(4, DB::table('room_rates')->count());
    }
}
