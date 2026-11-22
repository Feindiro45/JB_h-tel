<?php

namespace App\Modules\Reservations\Application\Queries;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Reservations\DTO\ReservationFilters;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use Illuminate\Database\Eloquent\Builder;

/**
 * Recherche de réservations, partagée par l'écran et l'export Excel : statut, chambre,
 * catégorie, client, recherche, forfait, période qui chevauche `from`–`to`. Chambres et clients
 * sont résolus par les contrats publics de leurs modules.
 */
final class ReservationSearch
{
    public function __construct(
        private readonly RoomDirectory $rooms,
        private readonly CustomerDirectory $customers,
    ) {}

    /**
     * Requête filtrée, la plus récente d'abord ; `null` quand un filtre désigne une chambre ou un
     * client inconnu (aucun résultat).
     *
     * @return Builder<Reservation>|null
     */
    public function filtered(ReservationFilters $filters): ?Builder
    {
        $room = $filters->roomUuid !== null ? $this->rooms->findByUuid($filters->roomUuid) : null;
        $customer = $filters->customerUuid !== null ? $this->customers->findByUuid($filters->customerUuid) : null;
        if (($filters->roomUuid !== null && $room === null) || ($filters->customerUuid !== null && $customer === null)) {
            return null;
        }
        $typeRooms = null;
        if ($filters->roomTypeUuid !== null) {
            $typeId = $this->rooms->roomTypeIdByUuid($filters->roomTypeUuid);
            $typeRooms = array_map(fn ($r) => $r->id, array_values(array_filter($this->rooms->all(), fn ($r) => $r->roomTypeId === $typeId)));
        }

        return Reservation::query()
            ->with('occupants')
            ->when($filters->status !== null, fn (Builder $q) => $q->where('status', $filters->status?->value))
            ->when($room !== null, fn (Builder $q) => $q->where('room_id', $room?->id))
            ->when($customer !== null, fn (Builder $q) => $q->where('customer_id', $customer?->id))
            ->when($filters->search !== null, fn (Builder $q) => $q->whereIn('customer_id', $this->customers->searchIds((string) $filters->search)))
            ->when($typeRooms !== null, fn (Builder $q) => $q->whereIn('room_id', $typeRooms ?? []))
            ->when($filters->billingUnit !== null, fn (Builder $q) => $q->where('billing_unit', $filters->billingUnit?->value))
            ->when($filters->from !== null, fn (Builder $q) => $q->where('blocked_until', '>', $filters->from))
            ->when($filters->to !== null, fn (Builder $q) => $q->where('blocked_from', '<', $filters->to?->addDay()))
            ->orderByDesc('blocked_from');
    }
}
