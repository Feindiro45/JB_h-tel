<?php

namespace App\Modules\Identity\Http\Requests;

use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\DTO\CreateUserData;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

final class StoreUserRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:160'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            // Facultatif (6M) : sans mot de passe, un e-mail invite la personne à choisir le sien.
            'password' => ['nullable', 'string', 'confirmed', Password::min(10)->letters()->numbers()],
            'role' => ['required', Rule::enum(RoleName::class)],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['role' => 'rôle', 'active' => 'compte actif'];
    }

    public function toData(): CreateUserData
    {
        return new CreateUserData(
            name: $this->string('name')->trim()->toString(),
            email: $this->string('email')->trim()->lower()->toString(),
            password: $this->filled('password') ? $this->string('password')->toString() : null,
            role: $this->enum('role', RoleName::class) ?? RoleName::Cashier,
            active: $this->boolean('active', true),
        );
    }
}
