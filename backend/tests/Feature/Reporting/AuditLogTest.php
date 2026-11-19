<?php

namespace Tests\Feature\Reporting;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    public function test_lists_operations_with_french_labels_public_ids_and_no_internal_keys(): void
    {
        $stay = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$stay}/payments", ['amount_fcfa' => 20000, 'method' => 'CASH'])->assertCreated();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/discounts.cashier_max_percent', ['value' => 12])->assertOk();

        $response = $this->actingAs($this->admin)->getJson('/api/v1/audit-logs')->assertOk();
        $rows = $response->collect('data')->keyBy('action');

        $setting = $rows->get('setting.updated');
        $this->assertSame('Paramètre modifié', data_get($setting, 'label'));
        $this->assertSame('discounts.cashier_max_percent', data_get($setting, 'entity.id'));
        $this->assertSame(12, data_get($setting, 'after.value'));
        $this->assertSame('Directeur', data_get($setting, 'actor.name'));
        $this->assertSame('Encaissement enregistré', data_get($rows->get('payment.recorded'), 'label'));
        $created = $rows->get('reservation.created');
        $this->assertSame($stay, data_get($created, 'entity.id'));
        $this->assertSame('Réservation', data_get($created, 'entity.type_label'));
        $this->assertSame('Grâce', data_get($created, 'actor.name'));
        $this->assertSame('Caisse', data_get($response->collect('domains')->firstWhere('value', 'payment'), 'label'));

        // Aucun identifiant interne entier dans les états publiés (D-026).
        $this->assertDoesNotMatchRegularExpression('/"(id|[a-z_]+_id|[a-z_]+_by)":\d+/', (string) $response->getContent());
    }

    public function test_filters_by_domain_author_and_period(): void
    {
        $stay = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$stay}/payments", ['amount_fcfa' => 20000, 'method' => 'CASH'])->assertCreated();

        $payments = $this->actingAs($this->admin)->getJson('/api/v1/audit-logs?domain=payment')->assertOk()->collect('data');
        $this->assertSame(['payment.recorded'], $payments->pluck('action')->all());
        $this->actingAs($this->admin)->getJson("/api/v1/audit-logs?actor_id={$this->admin->uuid}")->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->admin)->getJson('/api/v1/audit-logs?from=2026-12-02')->assertOk()->assertJsonPath('meta.total', 0);
        $this->actingAs($this->admin)->getJson('/api/v1/audit-logs?domain=inconnu')->assertStatus(422)->assertJsonValidationErrors(['domain']);
        $this->actingAs($this->cashier)->getJson('/api/v1/audit-logs')->assertStatus(403);
    }
}
