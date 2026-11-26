<?php

namespace Tests\Feature\Settings;

use App\Modules\Billing\Models\Invoice;
use App\Shared\Settings\HotelIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/** D-073 : informations de l'établissement modifiables dans Paramètres, figées dans chaque facture. */
final class HotelIdentityTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    public function test_the_hotel_is_in_bambari_and_its_details_are_listed_in_settings(): void
    {
        $settings = $this->actingAs($this->admin)->getJson('/api/v1/settings')->assertOk()->collect('data')->keyBy('key');

        $this->assertSame('Bambari, République centrafricaine', $settings['hotel.city']['value']);
        $this->assertSame('JB Hôtel', $settings['hotel.name']['value']);
        foreach (['hotel.name', 'hotel.city', 'hotel.address', 'hotel.phone', 'hotel.email', 'hotel.tax_id', 'hotel.trade_register'] as $key) {
            $this->assertTrue($settings[$key]['editable'], $key);
            $this->assertSame('text', $settings[$key]['type'], $key);
        }
        $this->assertSame('Bambari, République centrafricaine', app(HotelIdentity::class)->toArray()['city']);
    }

    public function test_admin_updates_the_contact_and_new_invoices_use_it_while_issued_ones_stay_frozen(): void
    {
        $this->book()->assertCreated();
        $first = Invoice::query()->firstOrFail();
        $this->assertSame('Bambari, République centrafricaine', $first->snapshot_json['hotel']['city']);

        $this->actingAs($this->admin)->putJson('/api/v1/settings/hotel.phone', ['value' => '+236 75 00 11 22'])->assertOk();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/hotel.email', ['value' => 'reception@jb-hotel.com'])->assertOk();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/hotel.address', ['value' => 'Quartier Socada'])->assertOk();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/hotel.email', ['value' => 'pas-un-email'])
            ->assertStatus(422)->assertJsonValidationErrors(['value']);
        $this->actingAs($this->admin)->putJson('/api/v1/settings/hotel.name', ['value' => ''])
            ->assertStatus(422)->assertJsonValidationErrors(['value']);
        $this->actingAs($this->cashier)->putJson('/api/v1/settings/hotel.phone', ['value' => '+236 70 00 00 00'])->assertForbidden();

        $this->book(['room_id' => $this->room102->uuid])->assertCreated();
        $second = Invoice::query()->whereKeyNot($first->id)->firstOrFail();
        $this->assertSame('+236 75 00 11 22', $second->snapshot_json['hotel']['phone']);
        $this->assertSame('reception@jb-hotel.com', $second->snapshot_json['hotel']['email']);
        $this->assertSame('Quartier Socada', $second->snapshot_json['hotel']['address']);
        // La facture déjà émise garde les informations du jour de son émission.
        $this->assertNull($first->fresh()?->snapshot_json['hotel']['phone'] ?? null);

        $ticket = view('billing.ticket', ['doc' => $second->snapshot_json, 'status' => 'ISSUED', 'qr' => 'data:image/png;base64,AA=='])->render();
        foreach (['Bambari, République centrafricaine', 'Tél. : +236 75 00 11 22', 'reception@jb-hotel.com', 'Quartier Socada'] as $text) {
            $this->assertStringContainsString($text, $ticket);
        }
        $this->assertStringNotContainsString('Bangui', $ticket);
    }

    public function test_a_cleared_detail_is_no_longer_printed_and_receipts_follow_the_settings(): void
    {
        $this->actingAs($this->admin)->putJson('/api/v1/settings/hotel.phone', ['value' => '+236 75 00 11 22'])->assertOk();
        $this->actingAs($this->admin)->putJson('/api/v1/settings/hotel.phone', ['value' => null])->assertOk();
        $this->assertNull(app(HotelIdentity::class)->toArray()['phone']);

        $id = $this->bookOk();
        $payment = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$id}/payments", ['amount_fcfa' => 10000, 'method' => 'CASH'])
            ->assertCreated()->json('data.id');
        $this->actingAs($this->cashier)->getJson("/api/v1/payments/{$payment}")->assertOk()
            ->assertJsonPath('data.hotel.city', 'Bambari, République centrafricaine')
            ->assertJsonPath('data.hotel.phone', null);
    }
}
