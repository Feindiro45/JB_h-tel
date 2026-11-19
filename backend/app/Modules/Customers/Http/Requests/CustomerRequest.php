<?php

namespace App\Modules\Customers\Http\Requests;

use App\Modules\Customers\Models\Customer;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Création (POST) et modification partielle (PATCH) d'une fiche client.
 * Nom et téléphone obligatoires à la création (Q-10, provisoire).
 */
final class CustomerRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $trimmed = [];
        foreach (Customer::FIELDS as $field) {
            if (is_string($this->input($field))) {
                $value = trim($this->input($field));
                $trimmed[$field] = $value === '' ? null : $value;
            }
        }
        if (isset($trimmed['name'])) {
            $trimmed['name'] = mb_strtoupper($trimmed['name']);
        }
        if (isset($trimmed['email'])) {
            $trimmed['email'] = mb_strtolower($trimmed['email']);
        }
        $this->merge($trimmed);
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:160'],
            'first_name' => ['sometimes', 'nullable', 'string', 'max:160'],
            'phone' => [$required, 'string', 'max:40', 'regex:/^\+?[0-9 ().-]{6,40}$/'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'origin_city' => ['sometimes', 'nullable', 'string', 'max:160'],
            'origin_country' => ['sometimes', 'nullable', 'string', 'max:160'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            // Pas de « sometimes » : le type et le numéro de pièce vont toujours ensemble.
            'identification_type' => ['nullable', 'string', 'max:60', 'required_with:identification_number'],
            'identification_number' => ['nullable', 'string', 'max:100', 'required_with:identification_type'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'name' => 'nom',
            'first_name' => 'prénoms',
            'phone' => 'téléphone',
            'email' => 'adresse e-mail',
            'origin_city' => 'ville de provenance',
            'origin_country' => 'pays de provenance',
            'address' => 'adresse',
            'identification_type' => "type de pièce d'identité",
            'identification_number' => "numéro de pièce d'identité",
            'notes' => 'notes',
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['phone.regex' => 'Le numéro de téléphone ne peut contenir que des chiffres, des espaces et « + ( ) . - ».'];
    }

    /** @return array<string, string|null> */
    public function fields(): array
    {
        /** @var array<string, string|null> $validated */
        $validated = $this->validated();

        return $validated;
    }
}
