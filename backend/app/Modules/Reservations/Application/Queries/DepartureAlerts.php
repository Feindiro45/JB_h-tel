<?php

namespace App\Modules\Reservations\Application\Queries;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Reservations\Http\ReservationPresenter;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/** Alertes calculées : une prolongation ou un départ résout l'alerte sans état stocké. */
final class DepartureAlerts
{
    public function __construct(
        private readonly ReservationPresenter $presenter,
        private readonly RoomDirectory $rooms,
        private readonly CustomerDirectory $customers,
    ) {}

    /** @return array<string, int|string> */
    public function summary(): array
    {
        $at = CarbonImmutable::now();
        $base = Reservation::query()->overdue($at);

        return [
            'at' => $at->toIso8601String(),
            'total' => (clone $base)->count(),
            'rooms' => (clone $base)->distinct()->count('room_id'),
            'day' => (clone $base)->where('billing_unit', 'DAY')->count(),
            'half_day' => (clone $base)->where('billing_unit', 'HALF_DAY')->count(),
        ];
    }

    /**
     * @param  array{search?: string|null, billing_unit?: string|null}  $filters
     * @return array<string, mixed>
     */
    public function listing(array $filters, int $perPage): array
    {
        $at = CarbonImmutable::now();
        $base = Reservation::query()->overdue($at)->with('occupants');
        if (isset($filters['search']) && trim($filters['search']) !== '') {
            $search = trim($filters['search']);
            $customerIds = $this->customers->searchIds($search);
            $roomIds = array_map(fn ($room) => $room->id, array_filter($this->rooms->all(), fn ($room) => str_contains(mb_strtolower($room->number), mb_strtolower($search))));
            $base->where(fn (Builder $q) => $q->whereIn('customer_id', $customerIds)->orWhereIn('room_id', $roomIds));
        }
        if (! empty($filters['billing_unit'])) {
            $base->where('billing_unit', $filters['billing_unit']);
        }
        $page = $base->orderBy('blocked_until')->orderBy('id')->paginate($perPage);
        $rows = $this->presenter->many($page->items());
        foreach ($rows as &$row) {
            $row['overdue_minutes'] = max(0, (int) CarbonImmutable::parse($row['period']['blocked_until'])->diffInMinutes($at));
        }

        return [
            'at' => $at->toIso8601String(),
            'data' => $rows,
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage()],
        ];
    }
}
