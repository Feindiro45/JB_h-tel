<?php

namespace Database\Factories;

use App\Modules\Customers\Models\Customer;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\BillingUnit;
use App\Modules\RoomCatalog\Models\Room;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Réservation insérée directement (sans le service), pour préparer un état de test :
 * une réservation existante, un conflit, etc.
 *
 * @extends Factory<Reservation>
 */
class ReservationFactory extends Factory
{
    protected $model = Reservation::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $start = now()->addDay()->startOfDay();

        return [
            'customer_id' => Customer::factory(),
            'room_id' => Room::factory(),
            'start_date' => $start->toDateString(),
            'end_date' => $start->toDateString(),
            'blocked_from' => $start,
            'blocked_until' => $start->copy()->addDay(),
            'period_is_estimated' => true,
            'billing_unit' => BillingUnit::Day,
            'quantity' => 1,
            'applied_unit_price_fcfa' => 50000,
            'gross_fcfa' => 50000,
            'discount_fcfa' => 0,
            'net_fcfa' => 50000,
            'status' => ReservationStatus::Confirmed,
            'created_by' => User::factory(),
        ];
    }

    public function between(\DateTimeInterface $from, \DateTimeInterface $until): static
    {
        return $this->state(fn () => [
            'start_date' => $from->format('Y-m-d'),
            'end_date' => $until->format('Y-m-d'),
            'start_time' => $from->format('H:i:s'),
            'end_time' => $until->format('H:i:s'),
            'blocked_from' => $from,
            'blocked_until' => $until,
            'period_is_estimated' => false,
        ]);
    }

    public function status(ReservationStatus $status): static
    {
        return $this->state(fn () => ['status' => $status]);
    }
}
