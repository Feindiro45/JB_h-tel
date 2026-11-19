<?php

namespace Database\Factories;

use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Les états `admin()` et `cashier()` supposent que les rôles existent
 * (seeder RolesAndPermissionsSeeder).
 *
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected $model = User::class;

    /** Mot de passe des comptes générés en test. */
    public const PASSWORD = 'MotDePasse2026';

    protected static ?string $passwordHash = null;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$passwordHash ??= Hash::make(self::PASSWORD),
            'active' => true,
            'remember_token' => Str::random(10),
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['active' => false]);
    }

    public function admin(): static
    {
        return $this->afterCreating(fn (User $user) => $user->assignRole(RoleName::Admin->value));
    }

    public function cashier(): static
    {
        return $this->afterCreating(fn (User $user) => $user->assignRole(RoleName::Cashier->value));
    }
}
