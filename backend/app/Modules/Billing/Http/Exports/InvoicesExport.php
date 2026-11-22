<?php

namespace App\Modules\Billing\Http\Exports;

use App\Modules\Billing\Application\Queries\InvoiceList;
use App\Modules\Billing\Domain\InvoiceType;
use App\Modules\Billing\DTO\InvoiceFilters;
use App\Modules\Billing\Models\Invoice;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Classeur Excel des factures et avoirs (filtres de l'écran) : tableau de bord (facturé =
 * factures − avoirs, D-040) et feuille des documents. Client, chambre et montants viennent de
 * l'instantané figé : ce qui a été facturé, jamais l'état actuel.
 */
final class InvoicesExport
{
    public const MODULE = 'factures';

    public const MAX_ROWS = 20000;

    public function __construct(private readonly InvoiceList $list) {}

    public function build(InvoiceFilters $filters, ?Authenticatable $actor): Workbook
    {
        $documents = $this->list->all($filters, self::MAX_ROWS);

        $book = new Workbook('Factures et avoirs', ExportContext::of($actor, [
            'Type' => $filters->type?->label(),
            'Statut' => $filters->status?->label(),
            'Du' => $filters->from?->format('d/m/Y'),
            'Au' => $filters->until?->subDay()->format('d/m/Y'),
            'Recherche' => $filters->search,
        ]));
        $isCredit = fn (Invoice $i) => $i->type === InvoiceType::CreditNote;
        $invoices = array_values(array_filter($documents, fn (Invoice $i) => ! $isCredit($i)));
        $credits = array_values(array_filter($documents, $isCredit));
        $sum = fn (array $list) => array_sum(array_map(fn (Invoice $i) => $i->net_fcfa, $list));
        $book->kpis([
            ['label' => 'Factures', 'value' => $sum($invoices), 'format' => Workbook::FCFA, 'hint' => count($invoices).' facture(s)'],
            ['label' => 'Avoirs', 'value' => $sum($credits), 'format' => Workbook::FCFA, 'hint' => count($credits).' avoir(s)', 'tone' => 'C93644'],
            ['label' => 'Net facturé', 'value' => $sum($invoices) - $sum($credits), 'format' => Workbook::FCFA, 'hint' => 'Factures − avoirs', 'tone' => Workbook::GOLD],
            ['label' => 'Remises facturées', 'value' => array_sum(array_map(fn (Invoice $i) => $i->discount_fcfa, $invoices)), 'format' => Workbook::FCFA, 'hint' => 'Sur les factures', 'tone' => 'EDA100'],
        ]);
        $book->summary('Documents par statut', 'Documents', Workbook::group($documents, fn (Invoice $i) => $isCredit($i) ? 'Avoir' : $i->status->label()), 'pie');
        $book->summary('Net facturé par mois', 'Net facturé', Workbook::monthly($documents, fn (Invoice $i) => $i->issued_at->toIso8601String(), fn (Invoice $i) => $isCredit($i) ? -$i->net_fcfa : $i->net_fcfa), 'column', Workbook::FCFA);
        $book->summary('Net facturé par catégorie de chambre', 'Net facturé', Workbook::group($documents, fn (Invoice $i) => (string) (data_get($i->snapshot_json, 'room.type') ?? 'Sans catégorie'), fn (Invoice $i) => $isCredit($i) ? -$i->net_fcfa : $i->net_fcfa), 'bar', Workbook::FCFA);
        $book->note('Facturé = factures émises − avoirs émis, à leur date d’émission (D-040). Un document émis ne change jamais : une correction passe par un avoir.');

        $book->sheet('Documents', [
            ['label' => 'Numéro', 'width' => 18],
            ['label' => 'Type', 'width' => 10],
            ['label' => 'Émis le', 'type' => 'datetime'],
            ['label' => 'Statut', 'width' => 18],
            ['label' => 'Client', 'width' => 26],
            ['label' => 'Chambre', 'width' => 10],
            ['label' => 'Catégorie', 'width' => 14],
            ['label' => 'Arrivée', 'type' => 'date'],
            ['label' => 'Départ', 'type' => 'date'],
            ['label' => 'Brut', 'type' => 'fcfa'],
            ['label' => 'Remise', 'type' => 'fcfa'],
            ['label' => 'Net', 'type' => 'fcfa'],
            ['label' => 'Net signé', 'type' => 'fcfa'],
            ['label' => 'Déjà réglé à l’émission', 'type' => 'fcfa', 'total' => false],
            ['label' => 'Reste dû à l’émission', 'type' => 'fcfa', 'total' => false],
            ['label' => 'Facture annulée', 'width' => 18],
            ['label' => 'Émis par', 'width' => 18],
        ], array_map(fn (Invoice $i) => [
            $i->invoice_number,
            $i->type->label(),
            $i->issued_at,
            $isCredit($i) ? 'Avoir' : $i->status->label(),
            data_get($i->snapshot_json, 'customer.full_name'),
            data_get($i->snapshot_json, 'room.number'),
            data_get($i->snapshot_json, 'room.type'),
            data_get($i->snapshot_json, 'stay.start_date'),
            data_get($i->snapshot_json, 'stay.end_date'),
            $i->gross_fcfa,
            $i->discount_fcfa,
            $i->net_fcfa,
            $isCredit($i) ? -$i->net_fcfa : $i->net_fcfa,
            $isCredit($i) ? null : (int) data_get($i->snapshot_json, 'payments.net_paid_fcfa', 0),
            $isCredit($i) ? null : max(0, (int) data_get($i->snapshot_json, 'payments.balance_fcfa', 0)),
            $i->creditedInvoice?->invoice_number,
            data_get($i->snapshot_json, 'issued_by.name'),
        ], $documents), 'Un document par ligne ; « Net signé » compte les avoirs en négatif');

        return $book;
    }
}
