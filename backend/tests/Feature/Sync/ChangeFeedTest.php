<?php

namespace Tests\Feature\Sync;

use App\Modules\Customers\Models\Customer;
use App\Modules\Identity\Models\User;
use App\Modules\Sync\Models\SyncChange;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Journal des changements des postes (D-069) : chaque écriture suivie est annoncée dans la
 * même transaction, le curseur n'avance que sur les lignes sûres, chaque utilisateur ne voit que
 * les données qu'il peut consulter, et un curseur trop ancien demande un rechargement complet.
 */
class ChangeFeedTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->admin = User::factory()->admin()->create();
        $this->cashier = User::factory()->cashier()->create();
        $this->travel(1)->minutes();
    }

    /** @return array<string, mixed> */
    private function changes(User $user, string $cursor = 'v1.0'): array
    {
        return $this->actingAs($user)->getJson('/api/v1/sync/changes?cursor='.$cursor)
            ->assertOk()
            ->json();
    }

    public function test_une_creation_est_annoncee_et_le_curseur_avance(): void
    {
        $start = $this->actingAs($this->admin)->getJson('/api/v1/sync/status')->assertOk()->json('data.cursor');
        $customer = Customer::factory()->create();
        $this->travel(1)->minutes();

        $feed = $this->changes($this->admin, $start);
        $this->assertContains(
            ['entity' => 'customer', 'id' => $customer->uuid, 'action' => 'created'],
            array_map(fn (array $row) => array_intersect_key($row, array_flip(['entity', 'id', 'action'])), $feed['data']),
        );
        $this->assertNotSame($start, $feed['meta']['cursor']);
        $this->assertSame([], $this->changes($this->admin, $feed['meta']['cursor'])['data']);
        $this->assertSame(1, $feed['meta']['protocol']);
    }

    public function test_une_operation_annulee_n_annonce_aucun_changement(): void
    {
        $before = SyncChange::query()->count();
        try {
            DB::transaction(function (): void {
                Customer::factory()->create();
                throw new \RuntimeException('refus');
            });
        } catch (\RuntimeException) {
        }
        $this->assertSame($before, SyncChange::query()->count());
    }

    public function test_les_lignes_recentes_sont_rendues_sans_faire_avancer_le_curseur(): void
    {
        $cursor = $this->changes($this->admin)['meta']['cursor'];
        $customer = Customer::factory()->create();

        $feed = $this->changes($this->admin, $cursor);
        /** @var list<array{id: string|null}> $rows */
        $rows = $feed['data'];
        $this->assertSame($customer->uuid, end($rows)['id'] ?? null);
        $this->assertSame($cursor, $feed['meta']['cursor']);
        $this->assertSame($cursor, $this->actingAs($this->admin)->getJson('/api/v1/sync/status')->json('data.cursor'));

        $this->travel(20)->seconds();
        $this->assertNotSame($cursor, $this->changes($this->admin, $cursor)['meta']['cursor']);
    }

    public function test_chacun_ne_voit_que_les_donnees_qu_il_peut_consulter_mais_le_curseur_avance(): void
    {
        $cursor = $this->changes($this->cashier)['meta']['cursor'];
        User::factory()->cashier()->create();
        $this->travel(1)->minutes();

        $cashierFeed = $this->changes($this->cashier, $cursor);
        $this->assertSame([], array_values(array_filter($cashierFeed['data'], fn (array $row) => $row['entity'] === 'user')));
        $this->assertNotSame($cursor, $cashierFeed['meta']['cursor']);
        $this->assertNotEmpty(array_filter($this->changes($this->admin, $cursor)['data'], fn (array $row) => $row['entity'] === 'user'));
    }

    public function test_pagination_par_lots(): void
    {
        $cursor = $this->changes($this->admin)['meta']['cursor'];
        Customer::factory()->count(5)->create();
        $this->travel(1)->minutes();

        $page = $this->actingAs($this->admin)->getJson("/api/v1/sync/changes?cursor={$cursor}&limit=2")->assertOk()->json();
        $this->assertCount(2, $page['data']);
        $this->assertTrue($page['meta']['has_more']);
        $rest = $this->actingAs($this->admin)->getJson('/api/v1/sync/changes?cursor='.$page['meta']['cursor'].'&limit=10')->json();
        $this->assertCount(3, $rest['data']);
        $this->assertFalse($rest['meta']['has_more']);
    }

    public function test_curseur_trop_ancien_ou_invalide(): void
    {
        Customer::factory()->count(3)->create();
        $this->travel(1)->minutes();
        $oldest = (int) SyncChange::query()->min('id');
        SyncChange::query()->where('id', '<', $oldest + 2)->delete();

        $this->actingAs($this->admin)->getJson('/api/v1/sync/changes?cursor=v1.'.max(1, $oldest - 1))
            ->assertStatus(410)
            ->assertJsonPath('code', 'sync_cursor_expired');
        $this->actingAs($this->admin)->getJson('/api/v1/sync/changes?cursor=abc')
            ->assertStatus(422);
    }

    public function test_lecture_reservee_aux_utilisateurs_connectes(): void
    {
        $this->getJson('/api/v1/sync/status')->assertUnauthorized();
        $this->getJson('/api/v1/sync/changes')->assertUnauthorized();
    }

    public function test_journal_purge_apres_la_duree_de_conservation(): void
    {
        Customer::factory()->create();
        $this->travel(400)->days();
        Customer::factory()->create();
        $this->artisan('model:prune', ['--model' => [SyncChange::class]])->assertSuccessful();
        $this->assertSame(1, SyncChange::query()->where('entity', 'customer')->count());
    }
}
