<?php

namespace App\Modules\Reservations\Http\Requests;

use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\DTO\ReservationFilters;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Filtres de la liste des réservations (écran et export Excel). */
final class ReservationListRequest extends FormRequest
{
    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'status' => ['nullable', Rule::enum(ReservationStatus::class)],
            // Une chambre ou un client inconnu donne une liste vide, pas une erreur.
            'room_id' => ['nullable', 'string', 'max:64'],
            'customer_id' => ['nullable', 'string', 'max:64'],
            'room_type_id' => ['nullable', 'uuid'],
            'search' => ['nullable', 'string', 'max:160'],
            'billing_unit' => ['nullable', Rule::enum(BillingUnit::class)],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'status' => 'statut', 'room_id' => 'chambre', 'customer_id' => 'client', 'room_type_id' => 'catégorie',
            'search' => 'recherche', 'billing_unit' => 'forfait', 'from' => 'date de début', 'to' => 'date de fin',
        ];
    }

    public function toData(): ReservationFilters
    {
        $timezone = (string) config('app.timezone');
        $text = fn (string $key) => $this->filled($key) ? $this->string($key)->trim()->toString() : null;

        return new ReservationFilters(
            status: ReservationStatus::tryFrom($this->string('status')->toString()),
            roomUuid: $text('room_id'),
            roomTypeUuid: $text('room_type_id'),
            customerUuid: $text('customer_id'),
            search: $text('search'),
            billingUnit: BillingUnit::tryFrom($this->string('billing_unit')->toString()),
            from: $this->filled('from') ? CarbonImmutable::parse($this->string('from')->toString(), $timezone)->startOfDay() : null,
            to: $this->filled('to') ? CarbonImmutable::parse($this->string('to')->toString(), $timezone)->startOfDay() : null,
        );
    }
}
