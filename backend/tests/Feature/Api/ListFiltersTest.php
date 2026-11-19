<?php

namespace Tests\Feature\Api;

use App\Modules\Customers\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

final class ListFiltersTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    public function test_customer_filters_and_server_pagination(): void
    {
        Customer::factory()->count(27)->create();
        $this->customer->update(['email' => 'awa@example.test', 'origin_city' => 'Bangui', 'origin_country' => 'RCA']);
        $this->actingAs($this->cashier)->getJson('/api/v1/customers?per_page=10&page=2')->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('meta.current_page', 2);
        $this->getJson('/api/v1/customers?email=awa&origin_city=Bangui&origin_country=RCA')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->customer->uuid);
        $this->getJson('/api/v1/customers?per_page=99999')->assertOk()->assertJsonCount(25, 'data');
    }

    public function test_reservation_receipt_and_invoice_search_find_the_customer(): void
    {
        $id = $this->bookOk();
        $this->postJson("/api/v1/reservations/$id/payments", ['amount_fcfa' => 10000, 'method' => 'CASH'])->assertCreated();
        $this->postJson("/api/v1/reservations/$id/invoices")->assertCreated();
        $term = rawurlencode('NGAÏKOSSET');
        foreach (['reservations', 'payments', 'invoices'] as $list) {
            $this->getJson("/api/v1/$list?search=$term&per_page=10")->assertOk()->assertJsonCount(1, 'data');
            $this->getJson("/api/v1/$list?search=introuvable")->assertOk()->assertJsonCount(0, 'data');
        }
        $this->getJson('/api/v1/reservations?room_type_id='.$this->standard->uuid)->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/reservations?billing_unit=HALF_DAY')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_agent_directories_expose_distinct_uuids_and_enforce_permissions(): void
    {
        $this->actingAs($this->admin);
        foreach (['cash-agents', 'report-agents', 'audit-actors'] as $endpoint) {
            $ids = $this->getJson('/api/v1/'.$endpoint)->assertOk()->json('data.*.id');
            $this->assertContains($this->admin->uuid, $ids);
            $this->assertContains($this->cashier->uuid, $ids);
            $this->assertCount(count($ids), array_unique($ids));
        }
        $this->actingAs($this->cashier)->getJson('/api/v1/audit-actors')->assertForbidden();
    }
}
