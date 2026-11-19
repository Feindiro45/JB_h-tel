<?php

namespace App\Modules\RoomCatalog\DTO;

/** Création : tous les champs ; modification : `null` = inchangé (le code n'est jamais modifié). */
final readonly class RoomTypeData
{
    public function __construct(
        public ?string $code = null,
        public ?string $label = null,
        public ?string $description = null,
        public bool $descriptionProvided = false,
    ) {}
}
