<?php

namespace App\Modules\Customers\Http\Exports;

use App\Modules\Customers\Application\Queries\CustomerSearch;
use App\Modules\Customers\DTO\CustomerFilters;
use App\Modules\Customers\Models\Customer;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Classeur Excel des clients (mêmes filtres que l'écran) : tableau de bord (origines, contacts,
 * nouveaux clients par mois) et feuille des fiches.
 */
final class CustomersExport
{
    public const MODULE = 'clients';

    /** Au-delà, l'export demande de restreindre les filtres (classeur trop lourd à ouvrir). */
    public const MAX_ROWS = 20000;

    public function __construct(private readonly CustomerSearch $search) {}

    public function build(CustomerFilters $filters, ?Authenticatable $actor): Workbook
    {
        /** @var list<Customer> $customers */
        $customers = $this->search->query($filters)->limit(self::MAX_ROWS)->get()->all();

        $book = new Workbook('Clients', ExportContext::of($actor, [
            'Recherche' => $filters->search,
            'E-mail' => $filters->email,
            'Ville' => $filters->originCity,
            'Pays' => $filters->originCountry,
        ]));
        $count = fn (callable $test) => count(array_filter($customers, $test));
        $monthStart = now()->startOfMonth();
        $book->kpis([
            ['label' => 'Clients', 'value' => count($customers), 'format' => Workbook::INTEGER, 'hint' => 'Selon les filtres de l’écran'],
            ['label' => 'Nouveaux ce mois-ci', 'value' => $count(fn (Customer $c) => $c->created_at !== null && $c->created_at >= $monthStart), 'format' => Workbook::INTEGER, 'hint' => 'Fiches créées depuis le 1er', 'tone' => '2A78D6'],
            ['label' => 'Joignables par e-mail', 'value' => $count(fn (Customer $c) => $c->email !== null && $c->email_notifications), 'format' => Workbook::INTEGER, 'hint' => 'E-mail renseigné, envois acceptés', 'tone' => Workbook::GOLD],
            ['label' => 'Avec téléphone', 'value' => $count(fn (Customer $c) => $c->phone !== null), 'format' => Workbook::INTEGER, 'hint' => 'Numéro renseigné'],
        ]);
        $origin = fn (?string $value) => $value === null || trim($value) === '' ? 'Non renseigné' : mb_convert_case(trim($value), MB_CASE_TITLE);
        $book->summary('Clients par pays d’origine', 'Clients', array_slice(Workbook::group($customers, fn (Customer $c) => $origin($c->origin_country)), 0, 8), 'pie');
        $book->summary('Villes d’origine les plus fréquentes', 'Clients', array_slice(Workbook::group($customers, fn (Customer $c) => $origin($c->origin_city)), 0, 10), 'bar');
        $book->summary('Nouveaux clients par mois', 'Clients', Workbook::monthly($customers, fn (Customer $c) => $c->created_at?->toIso8601String()), 'column');
        $book->note('Données personnelles : conservez ce fichier en lieu sûr et ne le diffusez pas en dehors de l’hôtel.');

        $book->sheet('Clients', [
            ['label' => 'Nom', 'width' => 20],
            ['label' => 'Prénoms', 'width' => 22],
            ['label' => 'Téléphone', 'width' => 16],
            ['label' => 'E-mail', 'width' => 28],
            ['label' => 'E-mails acceptés', 'width' => 12],
            ['label' => 'Ville d’origine', 'width' => 18],
            ['label' => 'Pays d’origine', 'width' => 18],
            ['label' => 'Adresse', 'width' => 28],
            ['label' => 'Pièce d’identité', 'width' => 16],
            ['label' => 'Numéro de la pièce', 'width' => 18],
            ['label' => 'Notes', 'width' => 30],
            ['label' => 'Créé le', 'type' => 'datetime'],
        ], array_map(fn (Customer $c) => [
            $c->name,
            $c->first_name,
            $c->phone,
            $c->email,
            $c->email === null ? null : ($c->email_notifications ? 'Oui' : 'Non'),
            $c->origin_city,
            $c->origin_country,
            $c->address,
            $c->identification_type,
            $c->identification_number,
            $c->notes,
            $c->created_at,
        ], $customers), 'Une fiche par ligne ; filtres automatiques');

        return $book;
    }
}
