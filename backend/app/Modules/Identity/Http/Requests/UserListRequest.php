<?php

namespace App\Modules\Identity\Http\Requests;

use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\DTO\UserFilters;
use Illuminate\Foundation\Http\FormRequest;

/** Filtres de la liste des utilisateurs (écran et export Excel). */
final class UserListRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:160'],
            'role' => ['nullable', 'string', 'max:40'],
            'active' => ['nullable', 'in:0,1,true,false'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['search' => 'recherche', 'role' => 'rôle', 'active' => 'état du compte'];
    }

    public function toData(): UserFilters
    {
        return new UserFilters(
            search: $this->filled('search') ? $this->string('search')->trim()->toString() : null,
            role: RoleName::tryFrom($this->string('role')->toString()),
            active: $this->filled('active') ? $this->boolean('active') : null,
        );
    }
}
