<?php

namespace App\Modules\RoomCatalog\Contracts;

/**
 * Vue en lecture d'une chambre, exposée aux autres modules. `id` est la clé interne,
 * réservée aux échanges entre modules ; `uuid` est le seul identifiant à exposer (D-026).
 */
final readonly class RoomSnapshot
{
    public function __construct(
        public int $id,
        public string $uuid,
        public string $number,
        public int $roomTypeId,
        public string $roomTypeCode,
        public string $roomTypeLabel,
        public int $capacity,
        public bool $underMaintenance,
        /** D-072 : chambre ou salle de conférence. */
        public RoomKind $kind = RoomKind::Room,
    ) {}

    public function isConference(): bool
    {
        return $this->kind === RoomKind::Conference;
    }
}
