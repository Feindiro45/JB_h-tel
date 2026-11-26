<?php

namespace App\Modules\Identity\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Sortie de veille (D-074) : mot de passe de l'utilisateur déjà connecté. */
final class ConfirmPasswordRequest extends FormRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['password' => ['required', 'string', 'max:255']];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['password' => 'mot de passe'];
    }

    public function password(): string
    {
        return (string) $this->input('password');
    }
}
