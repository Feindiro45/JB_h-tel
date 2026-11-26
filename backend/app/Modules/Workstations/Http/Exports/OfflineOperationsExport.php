<?php

namespace App\Modules\Workstations\Http\Exports;

use App\Modules\Workstations\Application\Queries\OfflineOperationSearch;
use App\Modules\Workstations\DTO\OfflineOperationFilters;
use App\Modules\Workstations\Http\OfflineOperationPresenter;
use App\Modules\Workstations\Models\OfflineOperation;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Illuminate\Contracts\Auth\Authenticatable;

/** Classeur Excel « Mode hors ligne » : journal du serveur des opérations rejouées (lot 4A). */
final class OfflineOperationsExport
{
    public const MODULE = 'hors-ligne';

    public const MAX_ROWS = 20000;

    public function __construct(private readonly OfflineOperationSearch $search) {}

    public function build(OfflineOperationFilters $filters, ?Authenticatable $actor): Workbook
    {
        $operations = $this->search->query($filters)
            ->limit(self::MAX_ROWS)
            ->get()
            ->map(fn (OfflineOperation $o) => OfflineOperationPresenter::present($o))
            ->all();

        $book = new Workbook('Mode hors ligne', ExportContext::of($actor, [
            'Résultat' => OfflineOperation::OUTCOME_LABELS[(string) $filters->outcome] ?? null,
            'Examen' => OfflineOperation::REVIEW_LABELS[(string) $filters->review] ?? null,
            'Recherche' => $filters->search,
        ]));
        $count = fn (string $outcome) => count(array_filter($operations, fn (array $o) => $o['outcome'] === $outcome));
        $book->kpis([
            ['label' => 'Opérations rejouées', 'value' => count($operations), 'format' => Workbook::INTEGER, 'hint' => 'Envoyées au retour du réseau'],
            ['label' => 'Acceptées', 'value' => $count(OfflineOperation::ACCEPTED), 'format' => Workbook::INTEGER, 'hint' => 'Enregistrées par le serveur', 'tone' => '1BAF7A'],
            ['label' => 'Doublons évités', 'value' => $count(OfflineOperation::DUPLICATE), 'format' => Workbook::INTEGER, 'hint' => 'Déjà reçues (même clé)', 'tone' => '2A78D6'],
            ['label' => 'Refusées', 'value' => $count(OfflineOperation::REJECTED), 'format' => Workbook::INTEGER, 'hint' => 'Cause gardée, à examiner', 'tone' => 'C93644'],
        ]);
        $book->summary('Opérations par résultat', 'Opérations', Workbook::group($operations, fn (array $o) => (string) $o['outcome_label']), 'pie');
        $book->summary('Opérations par type', 'Opérations', Workbook::group($operations, fn (array $o) => (string) $o['kind_label']), 'bar');
        $book->summary('Opérations par poste', 'Opérations', Workbook::group($operations, fn (array $o) => (string) ($o['workstation'] ?? 'Poste inconnu')), 'bar');

        $book->sheet('Opérations rejouées', [
            ['label' => 'Faite hors ligne le', 'type' => 'datetime'],
            ['label' => 'Reçue le', 'type' => 'datetime'],
            ['label' => 'Type', 'width' => 22],
            ['label' => 'Opération', 'width' => 34],
            ['label' => 'Utilisateur', 'width' => 18],
            ['label' => 'Poste', 'width' => 16],
            ['label' => 'Tentatives', 'type' => 'int', 'total' => false],
            ['label' => 'Résultat', 'width' => 16],
            ['label' => 'Cause du refus', 'width' => 40],
            ['label' => 'Examen', 'width' => 18],
            ['label' => 'Examinée par', 'width' => 18],
            ['label' => 'Motif de l’examen', 'width' => 30],
        ], array_map(fn (array $o) => [
            $o['created_offline_at'],
            $o['received_at'],
            $o['kind_label'],
            $o['label'],
            $o['user'],
            $o['workstation'],
            (int) $o['attempts'],
            $o['outcome_label'],
            trim(($o['reason_title'] ?? '').' '.($o['reason'] ?? '')) ?: null,
            $o['review_label'],
            $o['reviewed_by'],
            $o['review_reason'],
        ], $operations), 'Journal du serveur : une opération rejouée par ligne');

        return $book;
    }
}
