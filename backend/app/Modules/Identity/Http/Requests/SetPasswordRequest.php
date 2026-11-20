<?php

namespace App\Modules\Identity\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/** Choix du mot de passe depuis le lien de l'invitation (6M) : mêmes exigences qu'à la création. */
final class SetPasswordRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email'],
            'token' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'confirmed', Password::min(10)->letters()->numbers()],
            'purpose' => ['nullable', 'string', 'in:invitation,reset'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['email' => 'adresse e-mail', 'token' => 'lien', 'password' => 'mot de passe'];
    }
}
