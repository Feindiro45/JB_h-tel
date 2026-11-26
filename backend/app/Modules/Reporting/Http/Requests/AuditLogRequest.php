<?php

namespace App\Modules\Reporting\Http\Requests;

use App\Modules\Identity\Models\User;
use App\Modules\Reporting\Application\Queries\AuditLogQuery;
use App\Modules\Reporting\DTO\AuditFilters;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Filtres du journal d'audit (écran et export Excel). */
final class AuditLogRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'domain' => ['nullable', Rule::in(array_keys(AuditLogQuery::DOMAINS))],
            'actor_id' => ['nullable', 'uuid', Rule::exists('users', 'uuid')],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['domain' => 'domaine', 'actor_id' => 'auteur', 'from' => 'date de début', 'to' => 'date de fin'];
    }

    public function toData(): AuditFilters
    {
        $timezone = (string) config('app.timezone');
        $actor = $this->filled('actor_id') ? User::query()->where('uuid', $this->string('actor_id')->toString())->first(['id', 'name']) : null;

        return new AuditFilters(
            domain: $this->filled('domain') ? $this->string('domain')->toString() : null,
            actorId: $actor?->id,
            actorName: $actor?->name,
            from: $this->filled('from') ? CarbonImmutable::parse($this->string('from')->toString(), $timezone)->startOfDay() : null,
            until: $this->filled('to') ? CarbonImmutable::parse($this->string('to')->toString(), $timezone)->startOfDay()->addDay() : null,
        );
    }
}
