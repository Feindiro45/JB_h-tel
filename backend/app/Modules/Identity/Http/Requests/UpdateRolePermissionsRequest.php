<?php

namespace App\Modules\Identity\Http\Requests;

use App\Modules\Identity\Domain\PermissionName;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateRolePermissionsRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', Rule::enum(PermissionName::class)],
        ];
    }

    /** @return list<PermissionName> */
    public function permissions(): array
    {
        /** @var list<string> $values */
        $values = $this->array('permissions');

        return array_map(fn (string $value) => PermissionName::from($value), $values);
    }
}
