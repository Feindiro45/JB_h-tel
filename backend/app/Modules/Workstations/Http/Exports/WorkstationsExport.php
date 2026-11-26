<?php

namespace App\Modules\Workstations\Http\Exports;

use App\Modules\Workstations\Http\WorkstationPresenter;
use App\Modules\Workstations\Models\Workstation;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Illuminate\Contracts\Auth\Authenticatable;

/** Classeur Excel « Postes de caisse » : postes enregistrés et désignations du poste principal (D-062). */
final class WorkstationsExport
{
    public const MODULE = 'postes';

    public function __construct(private readonly WorkstationPresenter $presenter) {}

    public function build(?Workstation $self, ?Authenticatable $actor): Workbook
    {
        $overview = $this->presenter->overview($self);
        /** @var list<array<string, mixed>> $stations */
        $stations = $overview['workstations'];
        /** @var list<array<string, mixed>> $assignments */
        $assignments = $overview['assignments'];
        /** @var array<string, mixed>|null $main */
        $main = $overview['main'];

        $book = new Workbook('Postes de caisse', ExportContext::of($actor));
        $active = array_values(array_filter($stations, fn (array $s) => $s['revoked_at'] === null));
        $book->kpis([
            ['label' => 'Postes actifs', 'value' => count($active), 'format' => Workbook::INTEGER, 'hint' => 'Navigateurs enregistrés'],
            ['label' => 'Poste principal', 'value' => $main === null ? 'Aucun' : (string) $main['name'], 'hint' => $main === null ? 'Aucune désignation' : 'Désignation n° '.$main['assignment_number'], 'tone' => Workbook::GOLD],
            ['label' => 'Silencieux', 'value' => count(array_filter($active, fn (array $s) => (bool) $s['silent'])), 'format' => Workbook::INTEGER, 'hint' => 'Sans signal récent', 'tone' => 'EDA100'],
            ['label' => 'Révoqués', 'value' => count($stations) - count($active), 'format' => Workbook::INTEGER, 'hint' => 'Ne peuvent plus écrire', 'tone' => 'C93644'],
        ]);
        $book->summary('Désignations par mode', 'Désignations', Workbook::group($assignments, fn (array $a) => (string) $a['mode_label']), 'pie');

        $book->sheet('Postes', [
            ['label' => 'Poste', 'width' => 20],
            ['label' => 'Principal', 'width' => 10],
            ['label' => 'État', 'width' => 14],
            ['label' => 'Navigateur', 'width' => 40],
            ['label' => 'Enregistré le', 'type' => 'datetime'],
            ['label' => 'Enregistré par', 'width' => 18],
            ['label' => 'Dernier signal', 'type' => 'datetime'],
            ['label' => 'Dernier utilisateur', 'width' => 18],
            ['label' => 'Révoqué le', 'type' => 'datetime'],
            ['label' => 'Motif de révocation', 'width' => 28],
        ], array_map(fn (array $s) => [
            $s['name'],
            $s['is_main'] ? 'Oui' : 'Non',
            $s['revoked_at'] !== null ? 'Révoqué' : ($s['silent'] ? 'Silencieux' : 'Actif'),
            $s['user_agent'],
            $s['registered_at'],
            $s['registered_by'],
            $s['last_seen_at'],
            $s['last_seen_by'],
            $s['revoked_at'],
            $s['revocation_reason'],
        ], $stations), 'Un navigateur enregistré par ligne');

        $book->sheet('Désignations', [
            ['label' => 'N°', 'type' => 'int', 'total' => false],
            ['label' => 'Mode', 'width' => 16],
            ['label' => 'Poste désigné', 'width' => 20],
            ['label' => 'Poste précédent', 'width' => 20],
            ['label' => 'Motif', 'width' => 30],
            ['label' => 'Par', 'width' => 18],
            ['label' => 'Le', 'type' => 'datetime'],
        ], array_map(fn (array $a) => [
            (int) $a['number'], $a['mode_label'], $a['workstation'], $a['previous_workstation'], $a['reason'], $a['assigned_by'], $a['assigned_at'],
        ], $assignments), 'Historique immuable des désignations du poste principal');

        return $book;
    }
}
