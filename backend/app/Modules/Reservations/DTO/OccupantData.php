<?php

namespace App\Modules\Reservations\DTO;

final readonly class OccupantData
{
    public function __construct(
        public string $name,
        public bool $isPrimary,
    ) {}
}
