<?php

namespace Tests\Feature\Exports;

use App\Modules\Customers\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * Exports Excel de chaque module (demande de l'utilisateur du 22/11/2026) : une feuille
 * « Tableau de bord » puis les feuilles de données, avec les droits de l'écran d'origine.
 */
class ModuleExportsTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** @param  TestResponse<Response>  $response */
    private function workbookOf(TestResponse $response, string $module): Spreadsheet
    {
        $response->assertOk()->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertMatchesRegularExpression("/filename=\"jb-hotel-{$module}-2026-12-01-\\d{4}\\.xlsx\"/", (string) $response->headers->get('Content-Disposition'));

        return ReservationExportTest::workbook($response);
    }

    public function test_customers_with_filters_and_text_that_never_becomes_a_formula(): void
    {
        Customer::factory()->create(['name' => 'DOKO', 'first_name' => 'Jean', 'origin_city' => '=1+1', 'origin_country' => 'Cameroun']);

        $book = $this->workbookOf($this->actingAs($this->cashier)->get('/api/v1/customers/export'), 'clients');

        $this->assertSame(['Tableau de bord', 'Clients'], $book->getSheetNames());
        $this->assertSame(2, $book->getSheet(0)->getCell('B6')->getValue());
        $this->assertCount(3, $book->getSheet(0)->getChartCollection());
        $sheet = $book->getSheet(1);
        $this->assertSame('DOKO', $sheet->getCell('A5')->getValue());
        // Une saisie qui commence par « = » reste du texte, à l'écran comme dans le classeur.
        $this->assertSame('=1+1', $sheet->getCell('F5')->getValue());
        $this->assertSame('s', $sheet->getCell('F5')->getDataType());
        $labels = array_column($book->getSheet(0)->rangeToArray('B5:B80', null, false, false), 0);
        $this->assertContains('=1+1', $labels);

        $filtered = $this->workbookOf($this->actingAs($this->cashier)->get('/api/v1/customers/export?origin_country=Cameroun'), 'clients');
        $this->assertSame(1, $filtered->getSheet(0)->getCell('B6')->getValue());
        $this->assertStringContainsString('Pays : Cameroun', (string) $filtered->getSheet(0)->getCell('A2')->getValue());
    }

    public function test_cash_desk_with_the_same_totals_as_the_journal(): void
    {
        $reservation = $this->bookOk();
        foreach ([20000, 10000] as $amount) {
            $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/payments", ['amount_fcfa' => $amount, 'method' => 'CASH'])->assertCreated();
        }
        $journal = $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal?from=2026-12-01&to=2026-12-01')->assertOk()->json('data.totals');

        $book = $this->workbookOf($this->actingAs($this->cashier)->get('/api/v1/cash-journal/export?from=2026-12-01&to=2026-12-01'), 'caisse');

        $this->assertSame(['Tableau de bord', 'Mouvements', 'Par jour', 'Par moyen'], $book->getSheetNames());
        $this->assertSame($journal['collected_fcfa'], $book->getSheet(0)->getCell('B6')->getValue());
        $this->assertSame(30000, $book->getSheet(0)->getCell('H6')->getValue());
        $this->assertSame('Encaissement', $book->getSheet(1)->getCell('B5')->getValue());
        $this->assertStringStartsWith('=SUBTOTAL(109,J5:J6)', (string) $book->getSheet(1)->getCell('J7')->getValue());
        // Même plafond que l'écran : 92 jours.
        $this->actingAs($this->cashier)->getJson('/api/v1/cash-journal/export?from=2026-01-01&to=2026-12-01')->assertStatus(422);
    }

    public function test_invoices_count_credit_notes_negatively(): void
    {
        $reservation = $this->bookOk();
        $invoice = $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/invoices")->assertCreated()->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/v1/invoices/{$invoice}/credit-notes", ['reason' => 'Erreur de chambre'])->assertCreated();

        $book = $this->workbookOf($this->actingAs($this->cashier)->get('/api/v1/invoices/export'), 'factures');

        $this->assertSame(['Tableau de bord', 'Documents'], $book->getSheetNames());
        $dashboard = $book->getSheet(0);
        $this->assertSame(50000, $dashboard->getCell('B6')->getValue());
        $this->assertSame(50000, $dashboard->getCell('E6')->getValue());
        $this->assertSame(0, $dashboard->getCell('H6')->getValue());
        $documents = $book->getSheet(1);
        $this->assertSame('AV-2026-000001', $documents->getCell('A5')->getValue());
        $this->assertSame(-50000, $documents->getCell('M5')->getValue());
        $this->assertSame('FAC-2026-000001', $documents->getCell('P5')->getValue());
    }

    public function test_financial_report_in_xlsx_matches_the_screen(): void
    {
        $reservation = $this->bookOk();
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$reservation}/payments", ['amount_fcfa' => 20000, 'method' => 'CASH'])->assertCreated();
        $url = '/api/v1/reports/financial?from=2026-12-01&to=2026-12-01';
        $totals = $this->actingAs($this->admin)->getJson($url)->assertOk()->json('data.totals');

        $book = $this->workbookOf($this->actingAs($this->admin)->get($url.'&format=xlsx'), 'rapport');

        $this->assertSame(['Tableau de bord', 'Par jour', 'Par catégorie', 'Soldes à encaisser', 'Définitions'], $book->getSheetNames());
        $this->assertSame($totals['net_collected_fcfa'], $book->getSheet(0)->getCell('B6')->getValue());
        $this->assertSame($totals['receivables_fcfa'], $book->getSheet(0)->getCell('K6')->getValue());
        $this->assertSame(30000, $book->getSheet(3)->getCell('I5')->getValue());
        $this->actingAs($this->cashier)->get($url.'&format=xlsx')->assertForbidden();
    }

    public function test_room_catalog_and_rate_history(): void
    {
        $book = $this->workbookOf($this->actingAs($this->admin)->get('/api/v1/room-catalog/export'), 'chambres-tarifs');

        $this->assertSame(['Tableau de bord', 'Chambres', 'Catégories', 'Tarifs'], $book->getSheetNames());
        $this->assertSame(2, $book->getSheet(0)->getCell('B6')->getValue());
        $this->assertSame('101', $book->getSheet(1)->getCell('A5')->getValue());
        $this->assertSame('s', $book->getSheet(1)->getCell('A5')->getDataType());
        $this->assertSame(4, $book->getSheet(3)->getHighestDataRow() - 4);
    }

    public function test_administration_exports_are_reserved_to_the_administrator(): void
    {
        $users = $this->workbookOf($this->actingAs($this->admin)->get('/api/v1/users/export'), 'utilisateurs');
        $this->assertSame(['Tableau de bord', 'Utilisateurs'], $users->getSheetNames());
        $this->assertSame(2, $users->getSheet(0)->getCell('B6')->getValue());

        $this->bookOk();
        $audit = $this->workbookOf($this->actingAs($this->admin)->get('/api/v1/audit-logs/export?domain=reservation'), 'audit');
        $this->assertSame(['Tableau de bord', 'Journal'], $audit->getSheetNames());
        $this->assertSame(1, $audit->getSheet(0)->getCell('B6')->getValue());
        $this->assertSame('Réservation créée', $audit->getSheet(1)->getCell('C5')->getValue());

        $stations = $this->workbookOf($this->actingAs($this->admin)->get('/api/v1/workstations/export'), 'postes');
        $this->assertSame(['Tableau de bord', 'Postes', 'Désignations'], $stations->getSheetNames());
        $offline = $this->workbookOf($this->actingAs($this->admin)->get('/api/v1/offline/operations/export'), 'hors-ligne');
        $this->assertSame(['Tableau de bord', 'Opérations rejouées'], $offline->getSheetNames());

        foreach (['users/export', 'audit-logs/export', 'workstations/export', 'offline/operations/export'] as $path) {
            $this->actingAs($this->cashier)->get("/api/v1/{$path}")->assertForbidden();
        }
    }
}
