<?php

namespace App\Modules\Identity\Application\Queries;

use App\Modules\Identity\DTO\UserFilters;
use App\Modules\Identity\Models\User;
use Illuminate\Database\Eloquent\Builder;

/** Recherche d'utilisateurs, partagée par l'écran et l'export Excel ; ordre alphabétique. */
final class UserSearch
{
    /** Rôles et droits lus par la présentation. */
    public const RELATIONS = ['roles.permissions', 'permissions'];

    /** @return Builder<User> */
    public function query(UserFilters $filters): Builder
    {
        $term = '%'.addcslashes((string) $filters->search, '%_\\').'%';

        return User::query()
            ->with(self::RELATIONS)
            ->when($filters->search !== null, fn (Builder $query) => $query->where(fn (Builder $q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term)))
            ->when($filters->role !== null, fn (Builder $query) => $query->role($filters->role?->value))
            ->when($filters->active !== null, fn (Builder $query) => $query->where('active', $filters->active))
            ->orderBy('name');
    }
}
