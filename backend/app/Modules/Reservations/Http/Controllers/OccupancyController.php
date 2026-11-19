<?php

namespace App\Modules\Reservations\Http\Controllers;

use App\Modules\Reservations\Application\Queries\RoomOccupancy;
use App\Modules\Reservations\Application\Services\ReservationQuoter;
use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Http\ReservationPresenter;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Écrans « Disponibilités » (période) et « Occupation des chambres » (instant). */
final class OccupancyController
{
    public function __construct(private readonly RoomOccupancy $occupancy) {}

    /**
     * Disponibilités sur une période, mêmes paramètres que la réservation (heures facultatives,
     * politique D-009). `only_free=1` ne garde que les chambres réservables.
     */
    public function availability(Request $request, RoomDirectory $rooms): JsonResponse
    {
        $validated = $request->validate([
            'start_date' => ['required', 'date_format:Y-m-d'],
            'end_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'room_type_id' => ['nullable', 'uuid', Rule::exists('room_types', 'uuid')],
            'min_capacity' => ['nullable', 'integer', 'min:1'],
            'only_free' => ['nullable', 'boolean'],
        ], attributes: [
            'start_date' => "date d'arrivée", 'end_date' => 'date de départ',
            'start_time' => "heure d'arrivée", 'end_time' => 'heure de départ',
            'room_type_id' => 'type de chambre', 'min_capacity' => 'capacité minimale',
        ]);

        $period = BlockedPeriod::fromStay(
            $validated['start_date'], $validated['end_date'], $validated['start_time'] ?? null, $validated['end_time'] ?? null,
        );
        ReservationQuoter::assertValidPeriod($period);

        $typeId = isset($validated['room_type_id']) ? $rooms->roomTypeIdByUuid($validated['room_type_id']) : null;
        $minCapacity = isset($validated['min_capacity']) ? (int) $validated['min_capacity'] : null;

        $rows = $this->occupancy->forPeriod($period, $typeId, $minCapacity);
        if ($request->boolean('only_free')) {
            $rows = array_values(array_filter($rows, fn (array $row) => $row['state'] === RoomOccupancy::FREE));
        }

        return new JsonResponse([
            'period' => [
                'blocked_from' => $period->from->toIso8601String(),
                'blocked_until' => $period->until->toIso8601String(),
                'is_estimated' => $period->estimated,
            ],
            'data' => array_map(fn (array $row) => [
                'room' => ReservationPresenter::room($row['room']),
                'state' => $row['state'],
                'state_label' => RoomOccupancy::LABELS[$row['state']],
                'reservations' => array_map(fn (Reservation $r) => ReservationPresenter::brief($r), $row['reservations']),
            ], $rows),
        ]);
    }

    /** Planning « Disponibilités » : état de chaque chambre jour par jour (7 jours par défaut, 31 au plus). */
    public function planning(Request $request, RoomDirectory $rooms): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'days' => ['nullable', 'integer', 'min:1', 'max:31'],
            'room_type_id' => ['nullable', 'uuid', Rule::exists('room_types', 'uuid')],
        ], attributes: ['from' => 'date de début', 'days' => 'nombre de jours', 'room_type_id' => 'type de chambre']);

        $from = isset($validated['from'])
            ? CarbonImmutable::parse($validated['from'], (string) config('app.timezone'))
            : CarbonImmutable::today();
        $days = (int) ($validated['days'] ?? 7);
        $typeId = isset($validated['room_type_id']) ? $rooms->roomTypeIdByUuid($validated['room_type_id']) : null;

        return new JsonResponse([
            'from' => $from->toDateString(),
            'days' => array_map(fn (int $i) => $from->addDays($i)->toDateString(), range(0, $days - 1)),
            'labels' => RoomOccupancy::LABELS,
            'data' => array_map(fn (array $row) => [
                'room' => ReservationPresenter::room($row['room']),
                'days' => $row['days'],
            ], $this->occupancy->planning($from, $days, $typeId)),
        ]);
    }

    /** Occupation à un instant (par défaut maintenant) : libre, réservée, occupée, maintenance. */
    public function occupancy(Request $request): JsonResponse
    {
        $request->validate(['at' => ['nullable', 'date']], attributes: ['at' => 'date et heure']);
        $at = $request->filled('at')
            ? CarbonImmutable::parse($request->string('at')->toString(), (string) config('app.timezone'))
            : CarbonImmutable::now();

        return new JsonResponse([
            'at' => $at->toIso8601String(),
            'data' => array_map(fn (array $row) => [
                'room' => ReservationPresenter::room($row['room']),
                'state' => $row['state'],
                'state_label' => RoomOccupancy::LABELS[$row['state']],
                'current' => $row['current'] === null ? null : ReservationPresenter::brief($row['current']) + [
                    'expected_departure' => $row['current']->blocked_until->toIso8601String(),
                ],
                'next' => $row['next'] === null ? null : ReservationPresenter::brief($row['next']),
                'reserved_later' => $row['next'] !== null,
            ], $this->occupancy->at($at)),
        ]);
    }
}
