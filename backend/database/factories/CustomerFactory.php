<?php

namespace Database\Factories;

use App\Modules\Customers\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Customer> */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'name' => strtoupper(fake()->lastName()),
            'first_name' => fake()->firstName(),
            'phone' => '+236 '.fake()->numerify('7# ## ## ##'),
            'origin_city' => 'Bangui',
            'origin_country' => 'République centrafricaine',
        ];
    }
}
