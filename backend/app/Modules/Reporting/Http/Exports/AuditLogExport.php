<?php

namespace App\Modules\Reporting\Http\Exports;

use App\Modules\Reporting\Application\Queries\AuditLogQuery;
use App\Modules\Reporting\DTO\AuditFilters;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Classeur Excel du journal d'audit (filtres de l'écran, administrateur) : tableau de bord
 * (actions par domaine, par auteur, par mois) et feuille des entrées, avec les états avant/après
 * publics (sans identifiant interne ni secret, D-042).
 */
final class AuditLogExport
{
    public const MODULE = 'audit';

    public const MAX_ROWS = 10000;

    public function __construct(private readonly AuditLogQuery $query) {}

    public function build(AuditFilters $filters, ?Authenticatable $actor): Workbook
    {
        /** @var list<array<string, mixed>> $rows */
        $rows = $this->query->page($filters, self::MAX_ROWS)['rows'];

        $book = new Workbook('Journal d’audit', ExportContext::of($actor, [
            'Domaine' => $filters->domain !== null ? (AuditLogQuery::DOMAINS[$filters->domain] ?? $filters->domain) : null,
            'Auteur' => $filters->actorName,
            'Du' => $filters->from?->format('d/m/Y'),
            'Au' => $filters->until?->subDay()->format('d/m/Y'),
        ]));
        $domain = fn (array $row) => AuditLogQuery::DOMAINS[(string) $row['domain']] ?? (string) $row['domain'];
        $author = fn (array $row) => (string) ($row['actor']['name'] ?? 'Système');
        $sensitive = ['deleted', 'cancelled', 'refunded', 'credited', 'permissions_updated', 'withdrawn'];
        $count = fn (callable $test) => count(array_filter($rows, $test));
        $book->kpis([
            ['label' => 'Entrées', 'value' => count($rows), 'format' => Workbook::INTEGER, 'hint' => 'Selon les filtres de l’écran'],
            ['label' => 'Auteurs', 'value' => count(array_unique(array_map($author, $rows))), 'format' => Workbook::INTEGER, 'hint' => 'Personnes ayant agi', 'tone' => '2A78D6'],
            ['label' => 'Actions sensibles', 'value' => $count(fn (array $row) => in_array(substr((string) strrchr((string) $row['action'], '.'), 1), $sensitive, true)), 'format' => Workbook::INTEGER, 'hint' => 'Suppressions, annulations, remboursements, avoirs, droits', 'tone' => 'C93644'],
            ['label' => 'Connexions', 'value' => $count(fn (array $row) => $row['action'] === 'auth.login'), 'format' => Workbook::INTEGER, 'hint' => 'Ouvertures de session', 'tone' => Workbook::GOLD],
        ]);
        $book->summary('Entrées par domaine', 'Entrées', Workbook::group($rows, $domain), 'pie');
        $book->summary('Entrées par auteur', 'Entrées', array_slice(Workbook::group($rows, $author), 0, 10), 'bar');
        $book->summary('Entrées par mois', 'Entrées', Workbook::monthly($rows, fn (array $row) => (string) $row['occurred_at']), 'column');
        $book->note('Le journal est en lecture seule. Les secrets (mots de passe, codes de vérification) ne sont jamais journalisés.');

        $state = fn (mixed $value) => $value === null || $value === [] ? null : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $book->sheet('Journal', [
            ['label' => 'Date', 'type' => 'datetime'],
            ['label' => 'Domaine', 'width' => 16],
            ['label' => 'Action', 'width' => 30],
            ['label' => 'Élément', 'width' => 14],
            ['label' => 'Auteur', 'width' => 20],
            ['label' => 'Adresse IP', 'width' => 15],
            ['label' => 'Avant', 'width' => 50, 'wrap' => true],
            ['label' => 'Après', 'width' => 50, 'wrap' => true],
        ], array_map(fn (array $row) => [
            $row['occurred_at'],
            $domain($row),
            $row['label'],
            $row['entity']['type_label'] ?? null,
            $author($row),
            $row['ip_address'],
            $state($row['before']),
            $state($row['after']),
        ], $rows), 'Une action par ligne, la plus récente d’abord');

        return $book;
    }
}
