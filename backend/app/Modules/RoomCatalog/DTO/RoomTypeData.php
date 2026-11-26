<?php

namespace App\Modules\RoomCatalog\DTO;

use App\Modules\RoomCatalog\Contracts\RoomKind;

/**
 * Création : tous les champs ; modification : `null` = inchangé (le code et la nature, D-072, ne
 * sont jamais modifiés).
 */
final readonly class RoomTypeData
{
    public function __construct(
        public ?string $code = null,
        public ?string $label = null,
        public ?string $description = null,
        public bool $descriptionProvided = false,
        public RoomKind $kind = RoomKind::Room,
    ) {}
}
