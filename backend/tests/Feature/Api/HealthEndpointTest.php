<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HealthEndpointTest extends TestCase
{
    public function test_health_reports_api_and_database_status(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('application', 'JB Hôtel')
            ->assertJsonPath('api_version', 'v1')
            ->assertJsonPath('database', 'ok');
    }

    public function test_server_time_uses_hotel_timezone(): void
    {
        $serverTime = $this->getJson('/api/v1/health')->json('server_time');

        // Africa/Bangui : UTC+1, sans heure d'été (docs/DECISIONS.md D-010).
        $this->assertStringEndsWith('+01:00', $serverTime);
    }

    public function test_health_is_degraded_when_database_is_unreachable(): void
    {
        $connection = config('database.default');
        config(["database.connections.{$connection}.port" => 1]);
        DB::purge($connection);

        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('database', 'indisponible');
    }

    public function test_root_url_points_to_the_api(): void
    {
        $this->getJson('/')
            ->assertOk()
            ->assertJsonPath('application', 'JB Hôtel');
    }
}
