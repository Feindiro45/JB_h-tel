<?php

namespace App\Modules\Cashier\Http\Requests;

use App\Modules\Cashier\DTO\CashPeriod;
use App\Modules\Identity\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/** Période et agent du journal de caisse (écran « Caisse » et export Excel). */
final class CashJournalRequest extends FormRequest
{
    /** Période maximale du journal ; les analyses plus longues relèvent des rapports (phase 7). */
    public const MAX_DAYS = 92;

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'agent_id' => ['nullable', 'uuid', Rule::exists('users', 'uuid')],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['from' => 'date de début', 'to' => 'date de fin', 'agent_id' => 'agent'];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }
            [$from, $to] = $this->days();
            if ($from->diffInDays($to) >= self::MAX_DAYS) {
                $validator->errors()->add('to', 'Le journal de caisse couvre au plus '.self::MAX_DAYS.' jours : réduisez la période, ou utilisez les rapports pour une analyse plus longue.');
            }
        }];
    }

    public function toData(): CashPeriod
    {
        [$from, $to] = $this->days();
        $agent = $this->filled('agent_id') ? User::query()->where('uuid', $this->string('agent_id')->toString())->first(['id', 'name']) : null;

        return new CashPeriod($from, $to->addDay(), $agent?->id, $agent?->name);
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} premier et dernier jour (aujourd'hui par défaut). */
    private function days(): array
    {
        $timezone = (string) config('app.timezone');
        $from = $this->filled('from') ? CarbonImmutable::parse($this->string('from')->toString(), $timezone)->startOfDay() : CarbonImmutable::now($timezone)->startOfDay();
        $to = $this->filled('to') ? CarbonImmutable::parse($this->string('to')->toString(), $timezone)->startOfDay() : $from;

        return [$from, $to];
    }
}
