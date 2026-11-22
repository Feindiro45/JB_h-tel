<?php

namespace App\Modules\RoomCatalog\Http\Exports;

use App\Modules\RoomCatalog\Application\Queries\RateHistory;
use App\Modules\RoomCatalog\Application\Queries\RateHistoryEntry;
use App\Modules\RoomCatalog\Domain\MaintenanceStatus;
use App\Modules\RoomCatalog\Domain\RateStatus;
use App\Modules\RoomCatalog\Models\Room;
use App\Modules\RoomCatalog\Models\RoomType;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Classeur Excel « Chambres et tarifs » : tableau de bord (parc par catégorie, maintenance, tarifs
 * en vigueur), feuilles des chambres et des catégories, et toutes les versions de tarifs quand
 * l'appelant a le droit de les voir. Les versions ne sont jamais modifiées (D-027) : la feuille
 * est l'historique complet.
 */
final class RoomCatalogExport
{
    public const MODULE = 'chambres-tarifs';

    public function __construct(private readonly RateHistory $history) {}

    public function build(bool $withRates, ?Authenticatable $actor): Workbook
    {
        /** @var list<Room> $rooms */
        $rooms = Room::query()->with('roomType')->orderBy('number')->get()->all();
        /** @var list<RoomType> $types */
        $types = RoomType::query()->withCount('rooms')->orderBy('label')->get()->all();
        $entries = $withRates ? $this->history->entries() : [];
        $active = array_values(array_filter($entries, fn (RateHistoryEntry $e) => $e->status === RateStatus::Active));

        $book = new Workbook('Chambres et tarifs', ExportContext::of($actor));
        $inMaintenance = count(array_filter($rooms, fn (Room $room) => $room->maintenance_status === MaintenanceStatus::Maintenance));
        $book->kpis([
            ['label' => 'Chambres', 'value' => count($rooms), 'format' => Workbook::INTEGER, 'hint' => 'Parc enregistré'],
            ['label' => 'Disponibles à la vente', 'value' => count($rooms) - $inMaintenance, 'format' => Workbook::INTEGER, 'hint' => 'Hors maintenance', 'tone' => '1BAF7A'],
            ['label' => 'En maintenance', 'value' => $inMaintenance, 'format' => Workbook::INTEGER, 'hint' => 'Non réservables', 'tone' => 'EDA100'],
            ['label' => 'Capacité totale', 'value' => array_sum(array_map(fn (Room $room) => (int) $room->capacity, $rooms)), 'format' => Workbook::INTEGER, 'hint' => 'Personnes', 'tone' => '2A78D6'],
        ]);
        $book->summary('Chambres par catégorie', 'Chambres', Workbook::group($rooms, fn (Room $room) => (string) $room->roomType->label), 'pie');
        if ($withRates) {
            $book->summary(
                'Tarifs en vigueur',
                'Montant',
                array_map(fn (RateHistoryEntry $e) => [$e->rate->roomType->label.' — '.mb_strtolower($e->rate->billing_unit->label()), $e->rate->amount_fcfa], $active),
                'bar',
                Workbook::FCFA,
            );
        }
        $book->note('L’état d’occupation (libre, réservée, occupée) se calcule pour une période : consultez l’écran Disponibilités ou le rapport financier.');

        $book->sheet('Chambres', [
            ['label' => 'Numéro', 'width' => 10],
            ['label' => 'Catégorie', 'width' => 16],
            ['label' => 'Capacité', 'type' => 'int'],
            ['label' => 'État', 'width' => 16],
            ['label' => 'Note de maintenance', 'width' => 30],
            ['label' => 'Notes', 'width' => 30],
        ], array_map(fn (Room $room) => [
            $room->number,
            $room->roomType->label,
            (int) $room->capacity,
            $room->maintenance_status->label(),
            $room->maintenance_note,
            $room->notes,
        ], $rooms), 'Une chambre par ligne');

        $book->sheet('Catégories', [
            ['label' => 'Code', 'width' => 12],
            ['label' => 'Catégorie', 'width' => 20],
            ['label' => 'Description', 'width' => 50],
            ['label' => 'Chambres', 'type' => 'int'],
        ], array_map(fn (RoomType $type) => [$type->code, $type->label, $type->description, (int) $type->rooms_count], $types), 'Catégories de chambre');

        if ($withRates) {
            $book->sheet('Tarifs', [
                ['label' => 'Catégorie', 'width' => 16],
                ['label' => 'Forfait', 'width' => 14],
                ['label' => 'Montant', 'type' => 'fcfa', 'total' => false],
                ['label' => 'Montant précédent', 'type' => 'fcfa', 'total' => false],
                ['label' => 'En vigueur du', 'type' => 'datetime'],
                ['label' => 'Jusqu’au', 'type' => 'datetime'],
                ['label' => 'Statut', 'width' => 14],
                ['label' => 'Motif', 'width' => 30],
                ['label' => 'Publié par', 'width' => 18],
            ], array_map(fn (RateHistoryEntry $e) => [
                $e->rate->roomType->label,
                $e->rate->billing_unit->label(),
                $e->rate->amount_fcfa,
                $e->previousAmountFcfa,
                $e->rate->effective_from,
                $e->rate->effective_to,
                $e->status->label(),
                $e->rate->reason,
                $e->rate->creator?->name,
            ], $entries), 'Toutes les versions, de la plus récente à la plus ancienne');
        }

        return $book;
    }
}
