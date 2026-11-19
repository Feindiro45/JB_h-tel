<?php

namespace Tests\Feature\Customers;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Customers\Models\Customer;
use App\Modules\Identity\Models\User;
use App\Shared\Audit\AuditLog;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class CustomerTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->cashier = User::factory()->cashier()->create();
    }

    public function test_cashier_creates_a_detailed_customer_record(): void
    {
        $id = $this->actingAs($this->cashier)->postJson('/api/v1/customers', [
            'name' => '  Ngaïkosset ',
            'first_name' => 'Awa Marie',
            'phone' => '+236 72 12 34 56',
            'email' => 'Awa@Exemple.CF',
            'origin_city' => 'Berbérati',
            'origin_country' => 'République centrafricaine',
            'identification_type' => 'CNI',
            'identification_number' => 'CF-123456',
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'NGAÏKOSSET')
            ->assertJsonPath('data.full_name', 'NGAÏKOSSET Awa Marie')
            ->assertJsonPath('data.email', 'awa@exemple.cf')
            ->json('data.id');

        $customer = Customer::query()->where('uuid', $id)->firstOrFail();
        $this->assertSame($this->cashier->id, $customer->created_by);
        $this->assertSame('Berbérati', AuditLog::query()->where('action', 'customer.created')->firstOrFail()->after_json['origin_city'] ?? null);
    }

    public function test_minimal_collection_name_and_phone_required_with_french_messages(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/customers', ['email' => 'pas-un-email', 'identification_number' => 'X1'])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Le champ nom est obligatoire.')
            ->assertJsonPath('errors.phone.0', 'Le champ téléphone est obligatoire.')
            ->assertJsonValidationErrors(['email', 'identification_type']);

        $this->actingAs($this->cashier)->postJson('/api/v1/customers', ['name' => 'Doko', 'phone' => 'abc'])
            ->assertStatus(422)
            ->assertJsonPath('errors.phone.0', 'Le numéro de téléphone ne peut contenir que des chiffres, des espaces et « + ( ) . - ».');
    }

    public function test_search_update_and_uuid_routes(): void
    {
        Customer::factory()->create(['name' => 'YAKITÉ', 'first_name' => 'Jean', 'phone' => '+236 75 00 11 22']);
        $awa = Customer::factory()->create(['name' => 'NGAÏKOSSET', 'first_name' => 'Awa', 'identification_number' => 'CF-999']);

        $search = fn (string $q) => array_column((array) $this->actingAs($this->cashier)->getJson('/api/v1/customers?search='.urlencode($q))->assertOk()->json('data'), 'name');
        $this->assertSame(['YAKITÉ'], $search('75 00'));
        $this->assertSame(['NGAÏKOSSET'], $search('CF-999'));
        $this->assertSame(['NGAÏKOSSET'], $search('awa'));

        $this->actingAs($this->cashier)->patchJson("/api/v1/customers/{$awa->uuid}", ['address' => 'Avenue Boganda', 'first_name' => null])
            ->assertOk()
            ->assertJsonPath('data.address', 'Avenue Boganda')
            ->assertJsonPath('data.first_name', null)
            ->assertJsonPath('data.phone', $awa->phone);

        $this->actingAs($this->cashier)->getJson("/api/v1/customers/{$awa->id}")->assertNotFound();
        $this->assertSame('NGAÏKOSSET', app(CustomerDirectory::class)->findByUuid($awa->uuid)?->fullName);
    }

    public function test_customer_management_requires_permission(): void
    {
        Role::findByName('caissiere', 'web')->revokePermissionTo('customers.manage');

        $this->actingAs($this->cashier)->postJson('/api/v1/customers', ['name' => 'Doko', 'phone' => '+236 70 00 00 00'])
            ->assertStatus(403);
        $this->actingAs($this->cashier)->getJson('/api/v1/customers')->assertOk();
    }
}
