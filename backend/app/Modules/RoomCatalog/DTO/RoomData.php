<?php

namespace App\Modules\RoomCatalog\DTO;

/** Création : numéro, type et capacité requis ; modification : `null` = inchangé. */
final readonly class RoomData
{
    public function __construct(
        public ?string $number = null,
        public ?int $roomTypeId = null,
        public ?int $capacity = null,
        public ?string $notes = null,
        public bool $notesProvided = false,
    ) {}
}
