<?php

namespace App\Modules\Reservations\DTO;

/** Prolongation : nouvelle fin de séjour et quantité ajoutée (0 si la quantité actuelle suffit). */
final readonly class ExtensionData
{
    public function __construct(
        public string $endDate,
        public ?string $endTime,
        public int $additionalQuantity,
        public bool $confirmed = false,
    ) {}
}
