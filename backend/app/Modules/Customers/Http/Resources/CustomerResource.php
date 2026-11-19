<?php

namespace App\Modules\Customers\Http\Resources;

use App\Modules\Customers\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Customer */
final class CustomerResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'name' => $this->name,
            'first_name' => $this->first_name,
            'full_name' => $this->fullName(),
            'phone' => $this->phone,
            'email' => $this->email,
            'origin_city' => $this->origin_city,
            'origin_country' => $this->origin_country,
            'address' => $this->address,
            'identification_type' => $this->identification_type,
            'identification_number' => $this->identification_number,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
