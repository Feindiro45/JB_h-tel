<?php

namespace App\Modules\Identity\Http\Exports;

use App\Modules\Identity\Application\Queries\UserSearch;
use App\Modules\Identity\DTO\UserFilters;
use App\Modules\Identity\Models\User;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Classeur Excel des utilisateurs (filtres de l'écran) : tableau de bord (rôles, comptes actifs,
 * dernières connexions) et feuille des comptes. Aucun secret : ni mot de passe, ni jeton.
 */
final class UsersExport
{
    public const MODULE = 'utilisateurs';

    public function __construct(private readonly UserSearch $search) {}

    public function build(UserFilters $filters, ?Authenticatable $actor): Workbook
    {
        /** @var list<User> $users */
        $users = $this->search->query($filters)->get()->all();

        $book = new Workbook('Utilisateurs', ExportContext::of($actor, [
            'Recherche' => $filters->search,
            'Rôle' => $filters->role?->label(),
            'État' => $filters->active === null ? null : ($filters->active ? 'Actifs' : 'Désactivés'),
        ]));
        $roleLabel = fn (User $user) => $user->primaryRole()?->label() ?? 'Sans rôle';
        $since = now()->subDays(30);
        $book->kpis([
            ['label' => 'Comptes', 'value' => count($users), 'format' => Workbook::INTEGER, 'hint' => 'Selon les filtres de l’écran'],
            ['label' => 'Actifs', 'value' => count(array_filter($users, fn (User $u) => $u->active)), 'format' => Workbook::INTEGER, 'hint' => 'Peuvent se connecter', 'tone' => '1BAF7A'],
            ['label' => 'Désactivés', 'value' => count(array_filter($users, fn (User $u) => ! $u->active)), 'format' => Workbook::INTEGER, 'hint' => 'Jamais supprimés', 'tone' => 'C93644'],
            ['label' => 'Connectés en 30 jours', 'value' => count(array_filter($users, fn (User $u) => $u->last_login_at !== null && $u->last_login_at >= $since)), 'format' => Workbook::INTEGER, 'hint' => 'Au moins une connexion', 'tone' => '2A78D6'],
        ]);
        $book->summary('Comptes par rôle', 'Comptes', Workbook::group($users, $roleLabel), 'pie');
        $book->summary('Comptes créés par mois', 'Comptes', Workbook::monthly($users, fn (User $u) => $u->created_at?->toIso8601String()), 'column');

        $book->sheet('Utilisateurs', [
            ['label' => 'Nom', 'width' => 24],
            ['label' => 'E-mail', 'width' => 30],
            ['label' => 'Rôle', 'width' => 16],
            ['label' => 'État', 'width' => 12],
            ['label' => 'Dernière connexion', 'type' => 'datetime'],
            ['label' => 'Créé le', 'type' => 'datetime'],
            ['label' => 'Droits', 'width' => 60],
        ], array_map(fn (User $u) => [
            $u->name,
            $u->email,
            $roleLabel($u),
            $u->active ? 'Actif' : 'Désactivé',
            $u->last_login_at,
            $u->created_at,
            $u->getAllPermissions()->pluck('name')->sort()->implode(', '),
        ], $users), 'Un compte par ligne ; aucun mot de passe ni jeton');

        return $book;
    }
}
