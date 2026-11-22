<?php

namespace App\Modules\Billing\Http\Requests;

use App\Modules\Billing\Domain\InvoiceStatus;
use App\Modules\Billing\Domain\InvoiceType;
use App\Modules\Billing\DTO\InvoiceFilters;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Filtres de l'écran « Factures et reçus » (liste et export Excel). */
final class InvoiceListRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'type' => ['nullable', Rule::enum(InvoiceType::class)],
            'status' => ['nullable', Rule::enum(InvoiceStatus::class)],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'search' => ['nullable', 'string', 'max:40'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['type' => 'type de document', 'status' => 'statut', 'from' => 'date de début', 'to' => 'date de fin', 'search' => 'numéro'];
    }

    public function toData(): InvoiceFilters
    {
        $timezone = (string) config('app.timezone');

        return new InvoiceFilters(
            type: InvoiceType::tryFrom($this->string('type')->toString()),
            status: InvoiceStatus::tryFrom($this->string('status')->toString()),
            from: $this->filled('from') ? CarbonImmutable::parse($this->string('from')->toString(), $timezone)->startOfDay() : null,
            until: $this->filled('to') ? CarbonImmutable::parse($this->string('to')->toString(), $timezone)->startOfDay()->addDay() : null,
            search: $this->filled('search') ? $this->string('search')->trim()->toString() : null,
        );
    }
}
