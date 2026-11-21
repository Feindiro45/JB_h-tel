<?php

namespace Tests\Feature\Settings;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    public function test_lists_every_rule_with_its_status_and_editability(): void
    {
        $settings = $this->actingAs($this->admin)->getJson('/api/v1/settings')->assertOk()->collect('data')->keyBy('key');

        $this->assertCount(11, $settings);
        $cap = $settings->get('discounts.cashier_max_percent');
        $this->assertSame(10, data_get($cap, 'value'));
        $this->assertSame(['PROVISIONAL', true, '%'], [data_get($cap, 'status'), data_get($cap, 'editable'), data_get($cap, 'unit')]);
        $halfDay = $settings->get('billing.half_day_max_hours');
        $this->assertSame(['VALIDATED', false, 12], [data_get($halfDay, 'status'), data_get($halfDay, 'editable'), data_get($halfDay, 'value')]);
        $this->assertFalse(data_get($settings->get('billing.allow_overpayment'), 'editable'));
        // Postes de caisse (D-062) : règle désactivée par défaut, délai de 5 minutes, tous deux modifiables.
        $enforce = $settings->get('workstations.enforce_main_post');
        $this->assertSame(['PROVISIONAL', true, false, 'boolean'], [data_get($enforce, 'status'), data_get($enforce, 'editable'), data_get($enforce, 'value'), data_get($enforce, 'type')]);
        $this->assertSame(5, data_get($settings->get('workstations.silent_after_minutes'), 'value'));
    }

    /** Le nouveau plafond s'applique dès la requête suivante et le changement est audité. */
    public function test_admin_changes_the_cashier_discount_cap(): void
    {
        $quote = fn () => $this->actingAs($this->cashier)->postJson('/api/v1/reservations/quote', $this->payload([
            'discount' => ['type' => 'PERCENT', 'value' => '15', 'reason' => 'Client fidèle'],
        ]));
        $quote()->assertJsonPath('code', 'discount_cap_exceeded');

        $this->actingAs($this->admin)->putJson('/api/v1/settings/discounts.cashier_max_percent', ['value' => 15])
            ->assertOk()->assertJsonPath('data.value', 15)->assertJsonPath('data.updated_by', 'Directeur');

        $quote()->assertOk()->assertJsonPath('data.price.net_fcfa', 42500);
        $log = DB::table('audit_logs')->where('action', 'setting.updated')->first();
        $this->assertNotNull($log);
        $this->assertSame(['key' => 'discounts.cashier_max_percent', 'value' => 10], json_decode((string) $log->before_json, true));
        $this->assertSame(['key' => 'discounts.cashier_max_percent', 'value' => 15], json_decode((string) $log->after_json, true));
    }

    public function test_removed_payment_method_is_no_longer_offered_nor_accepted(): void
    {
        $this->actingAs($this->admin)->putJson('/api/v1/settings/payments.methods', ['value' => ['CASH', 'MOBILE_MONEY']])
            ->assertOk()->assertJsonPath('data.value', ['CASH', 'MOBILE_MONEY']);

        $this->actingAs($this->cashier)->getJson('/api/v1/payment-methods')->assertOk()
            ->assertExactJson(['data' => [['value' => 'CASH', 'label' => 'Espèces'], ['value' => 'MOBILE_MONEY', 'label' => 'Mobile money']]]);
        $stay = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$stay}/payments", ['amount_fcfa' => 1000, 'method' => 'CARD'])
            ->assertStatus(422)->assertJsonValidationErrors(['method']);
    }

    public function test_rejects_invalid_values_locked_rules_and_non_admins(): void
    {
        $this->actingAs($this->admin)->putJson('/api/v1/settings/discounts.cashier_max_percent', ['value' => 150])
            ->assertStatus(422)->assertJsonValidationErrors(['value']);
        $this->actingAs($this->admin)->putJson('/api/v1/settings/payments.methods', ['value' => []])
            ->assertStatus(422)->assertJsonValidationErrors(['value']);
        $this->actingAs($this->admin)->putJson('/api/v1/settings/payments.methods', ['value' => ['CASH', 'BITCOIN']])
            ->assertStatus(422)->assertJsonValidationErrors(['value.1']);
        $this->actingAs($this->admin)->putJson('/api/v1/settings/billing.invoice_number_prefix', ['value' => 'X'])
            ->assertStatus(409)->assertJsonPath('code', 'setting_not_editable');
        $this->actingAs($this->admin)->putJson('/api/v1/settings/billing.unknown', ['value' => 1])
            ->assertStatus(404)->assertJsonPath('code', 'setting_not_found');
        $this->actingAs($this->cashier)->getJson('/api/v1/settings')->assertStatus(403);
        $this->actingAs($this->cashier)->putJson('/api/v1/settings/discounts.cashier_max_percent', ['value' => 50])->assertStatus(403);

        $this->assertSame('10', DB::table('settings')->where('key', 'discounts.cashier_max_percent')->value('value'));
    }
}
