<?php

namespace App\Modules\Identity\Http\Requests;

use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\DTO\UpdateUserData;
use App\Modules\Identity\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

final class UpdateUserRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        /** @var User $user */
        $user = $this->route('user');

        return [
            'name' => ['sometimes', 'string', 'max:160'],
            'email' => ['sometimes', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', 'string', 'confirmed', Password::min(10)->letters()->numbers()],
            'role' => ['sometimes', Rule::enum(RoleName::class)],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['role' => 'rôle', 'active' => 'compte actif'];
    }

    public function toData(): UpdateUserData
    {
        return new UpdateUserData(
            name: $this->has('name') ? $this->string('name')->trim()->toString() : null,
            email: $this->has('email') ? $this->string('email')->trim()->lower()->toString() : null,
            password: $this->has('password') ? $this->string('password')->toString() : null,
            role: $this->enum('role', RoleName::class),
            active: $this->has('active') ? $this->boolean('active') : null,
        );
    }
}
