<?php

namespace App\Modules\Customers\Http\Requests;

use App\Modules\Customers\DTO\CustomerFilters;
use Illuminate\Foundation\Http\FormRequest;

/** Filtres de la liste des clients (écran et export Excel). */
final class CustomerListRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:160'],
            'email' => ['nullable', 'string', 'max:160'],
            'origin_city' => ['nullable', 'string', 'max:120'],
            'origin_country' => ['nullable', 'string', 'max:120'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['search' => 'recherche', 'email' => 'e-mail', 'origin_city' => 'ville d’origine', 'origin_country' => 'pays d’origine'];
    }

    public function toData(): CustomerFilters
    {
        $text = fn (string $key) => $this->filled($key) ? $this->string($key)->trim()->toString() : null;

        return new CustomerFilters($text('search'), $text('email'), $text('origin_city'), $text('origin_country'));
    }
}
