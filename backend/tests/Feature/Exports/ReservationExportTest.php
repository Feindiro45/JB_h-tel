<?php

namespace Tests\Feature\Exports;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\BuildsHotel;
use Tests\TestCase;

/**
 * Export Excel des réservations : feuille « Tableau de bord » (indicateurs, synthèses, graphiques)
 * et feuilles de données, avec les filtres de l'écran.
 */
class ReservationExportTest extends TestCase
{
    use BuildsHotel, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildHotel();
    }

    /** @param  TestResponse<Response>  $response */
    public static function workbook(TestResponse $response): Spreadsheet
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $content = $response->streamedContent();
        file_put_contents($path, $content);
        $reader = IOFactory::createReader('Xlsx');
        $reader->setIncludeCharts(true);
        $book = $reader->load($path);
        unlink($path);

        return $book;
    }

    public function test_exports_a_dashboard_and_the_data_sheets_with_the_screen_filters(): void
    {
        $this->bookOk(['occupants' => [['name' => 'Awa Ngaïkosset', 'is_primary' => true], ['name' => 'Paul']]]);
        $this->bookOk(['room_id' => $this->room102->uuid, 'start_date' => '2026-12-03', 'end_date' => '2026-12-05', 'quantity' => 2]);
        $cancelled = $this->bookOk(['start_date' => '2026-12-10', 'end_date' => '2026-12-10']);
        $this->actingAs($this->cashier)->postJson("/api/v1/reservations/{$cancelled}/cancel", [
            'reason' => 'Client empêché', 'refund_fcfa' => 0, 'refund_method' => null,
        ])->assertOk();

        $response = $this->actingAs($this->cashier)->get('/api/v1/reservations/export')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertMatchesRegularExpression('/attachment; filename="jb-hotel-reservations-2026-12-01-\d{4}\.xlsx"/', (string) $response->headers->get('Content-Disposition'));
        $book = self::workbook($response);

        $this->assertSame(['Tableau de bord', 'Réservations', 'Occupants'], $book->getSheetNames());
        $dashboard = $book->getSheet(0);
        $this->assertSame('JB Hôtel — Réservations', $dashboard->getCell('A1')->getValue());
        $this->assertStringContainsString('Exporté le 01/12/2026 à 10:00 par Grâce', (string) $dashboard->getCell('A2')->getValue());
        // Tuiles : nombre de réservations, montant net hors annulées (50 000 + 2 × 30 000).
        $this->assertSame(3, $dashboard->getCell('B6')->getValue());
        $this->assertSame(110000, $dashboard->getCell('E6')->getValue());
        $this->assertSame('#,##0" FCFA"', $dashboard->getStyle('E6')->getNumberFormat()->getFormatCode());
        $this->assertCount(3, $dashboard->getChartCollection());

        $stays = $book->getSheet(1);
        $this->assertSame('Client', $stays->getCell('A4')->getValue());
        $this->assertSame('NGAÏKOSSET Awa', $stays->getCell('A5')->getValue());
        // En-tête ligne 4, trois séjours (5 à 7), ligne de total 8 calculée par la formule SOUS.TOTAL.
        $this->assertSame(8, $stays->getHighestDataRow());
        $this->assertSame('Total', $stays->getCell('A8')->getValue());
        $this->assertStringStartsWith('=SUBTOTAL(109,O5:O7)', (string) $stays->getCell('O8')->getValue());
        $this->assertSame('A5', $stays->getFreezePane());
        $this->assertSame('A4:U7', $stays->getAutoFilter()->getRange());
        // Le téléphone reste du texte (zéro de tête, pas de calcul).
        $this->assertSame('s', $stays->getCell('B5')->getDataType());
        $this->assertSame('dd/mm/yyyy', $stays->getStyle('E5')->getNumberFormat()->getFormatCode());

        $occupants = $book->getSheet(2);
        $this->assertSame('Occupant', $occupants->getCell('A4')->getValue());
        $names = array_column($occupants->rangeToArray('A5:A8'), 0);
        $this->assertContains('Paul', $names);

        // Filtre de l'écran : seulement les annulées.
        $filtered = self::workbook($this->actingAs($this->cashier)->get('/api/v1/reservations/export?status=CANCELLED')->assertOk());
        $this->assertSame(1, $filtered->getSheet(0)->getCell('B6')->getValue());
        $this->assertStringContainsString('Statut : Annulée', (string) $filtered->getSheet(0)->getCell('A2')->getValue());
    }

    public function test_requires_the_right_to_view_reservations(): void
    {
        $this->get('/api/v1/reservations/export')->assertUnauthorized();
    }
}
