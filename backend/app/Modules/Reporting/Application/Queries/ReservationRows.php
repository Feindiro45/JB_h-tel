<?php

namespace App\Modules\Reporting\Application\Queries;

use App\Modules\Reservations\Domain\ReservationStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/** Ligne « réservation » commune aux requêtes de lecture (tableau de bord, soldes à encaisser). */
final class ReservationRows
{
    public static function query(): Builder
    {
        return DB::table('reservations')
            ->join('customers', 'customers.id', '=', 'reservations.customer_id')
            ->join('rooms', 'rooms.id', '=', 'reservations.room_id')
            ->join('room_types', 'room_types.id', '=', 'rooms.room_type_id')
            ->select(
                'reservations.id', 'reservations.uuid', 'reservations.status', 'reservations.start_date', 'reservations.end_date',
                'reservations.start_time', 'reservations.end_time', 'reservations.net_fcfa',
                'customers.name', 'customers.first_name', 'customers.phone', 'rooms.number', 'room_types.label AS room_type',
            );
    }

    /** @return array<string, mixed> Identifiants publics uniquement (D-026). */
    public static function row(object $row): array
    {
        $status = ReservationStatus::from((string) $row->status);

        return [
            'id' => $row->uuid,
            'customer' => trim($row->name.' '.($row->first_name ?? '')),
            'room' => ['number' => $row->number, 'type' => $row->room_type],
            'start_date' => CarbonImmutable::parse((string) $row->start_date)->toDateString(),
            'end_date' => CarbonImmutable::parse((string) $row->end_date)->toDateString(),
            'start_time' => $row->start_time === null ? null : substr((string) $row->start_time, 0, 5),
            'end_time' => $row->end_time === null ? null : substr((string) $row->end_time, 0, 5),
            'status' => $status->value,
            'status_label' => $status->label(),
            'net_fcfa' => (int) $row->net_fcfa,
        ];
    }
}
