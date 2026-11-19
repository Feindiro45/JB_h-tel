<?php

namespace App\Modules\Reservations\Application\Queries;

use App\Modules\Reservations\Domain\BlockedPeriod;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Modules\RoomCatalog\Contracts\RoomSnapshot;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * États des chambres **calculés** à partir des réservations et de la maintenance
 * (jamais un booléen « occupée » modifié à la main, fiche 06).
 *
 * - Sur une période (disponibilités) : FREE, RESERVED, OCCUPIED, MAINTENANCE.
 * - À un instant (occupation) : idem, avec la réservation en cours ou bloquante, la sortie
 *   prévue et la prochaine réservation (« réservée pour plus tard »).
 */
final class RoomOccupancy
{
    public const FREE = 'FREE';

    public const RESERVED = 'RESERVED';

    public const OCCUPIED = 'OCCUPIED';

    public const MAINTENANCE = 'MAINTENANCE';

    public const LABELS = [
        self::FREE => 'Libre',
        self::RESERVED => 'Réservée',
        self::OCCUPIED => 'Occupée',
        self::MAINTENANCE => 'En maintenance',
    ];

    public function __construct(private readonly RoomDirectory $rooms) {}

    /**
     * @return list<array{room: RoomSnapshot, state: string, reservations: list<Reservation>}>
     */
    public function forPeriod(BlockedPeriod $period, ?int $roomTypeId = null, ?int $minCapacity = null): array
    {
        $rooms = $this->filteredRooms($roomTypeId, $minCapacity);
        $reservations = Reservation::query()
            ->whereIn('room_id', array_map(fn (RoomSnapshot $room) => $room->id, $rooms))
            ->whereIn('status', ReservationStatus::blockingValues())
            ->where('blocked_from', '<', $period->until)
            ->where('blocked_until', '>', $period->from)
            ->orderBy('blocked_from')
            ->get()
            ->groupBy('room_id');

        return array_map(function (RoomSnapshot $room) use ($reservations): array {
            /** @var Collection<int, Reservation> $overlapping */
            $overlapping = $reservations->get($room->id, collect());

            return [
                'room' => $room,
                'state' => $this->state($room, $overlapping),
                'reservations' => $overlapping->values()->all(),
            ];
        }, $rooms);
    }

    /**
     * @return list<array{room: RoomSnapshot, state: string, current: Reservation|null, next: Reservation|null}>
     */
    public function at(CarbonImmutable $at): array
    {
        $rooms = $this->rooms->all();
        $open = Reservation::query()
            ->whereIn('status', ReservationStatus::blockingValues())
            ->where(fn ($query) => $query->where('blocked_until', '>', $at)
                ->orWhere('status', ReservationStatus::InProgress->value))
            ->orderBy('blocked_from')
            ->get()
            ->groupBy('room_id');

        return array_map(function (RoomSnapshot $room) use ($open, $at): array {
            /** @var Collection<int, Reservation> $roomReservations */
            $roomReservations = $open->get($room->id, collect());
            $current = $roomReservations->first(fn (Reservation $r) => $r->status === ReservationStatus::InProgress)
                ?? $roomReservations->first(fn (Reservation $r) => $r->blocked_from->lte($at) && $r->blocked_until->gt($at));
            $next = $roomReservations->first(fn (Reservation $r) => $r->blocked_from->gt($at) && $r->id !== $current?->id);

            return [
                'room' => $room,
                'state' => $this->state($room, $current === null ? collect() : collect([$current])),
                'current' => $current,
                'next' => $next,
            ];
        }, $rooms);
    }

    /** @param  Collection<int, Reservation>  $reservations */
    private function state(RoomSnapshot $room, Collection $reservations): string
    {
        if ($reservations->contains(fn (Reservation $r) => $r->status === ReservationStatus::InProgress)) {
            return self::OCCUPIED;
        }
        if ($room->underMaintenance) {
            return self::MAINTENANCE;
        }

        return $reservations->isEmpty() ? self::FREE : self::RESERVED;
    }

    /** @return list<RoomSnapshot> */
    private function filteredRooms(?int $roomTypeId, ?int $minCapacity): array
    {
        return array_values(array_filter(
            $this->rooms->all(),
            fn (RoomSnapshot $room) => ($roomTypeId === null || $room->roomTypeId === $roomTypeId)
                && ($minCapacity === null || $room->capacity >= $minCapacity),
        ));
    }
}
