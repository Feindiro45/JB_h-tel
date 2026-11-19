<?php

namespace App\Modules\Identity\Models;

use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\Policies\UserPolicy;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Spatie\Permission\Traits\HasRoles;

/**
 * Utilisateur (administrateur ou caissière). Jamais supprimé : désactivé via `active`.
 *
 * @property int $id
 * @property string $name
 * @property string $email
 * @property bool $active
 * @property Carbon|null $last_login_at
 * @property Carbon|null $created_at
 */
#[UseFactory(UserFactory::class)]
#[UsePolicy(UserPolicy::class)]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasRoles, Notifiable;

    protected string $guard_name = 'web';

    /** @var list<string> */
    protected $fillable = [
        'name',
        'email',
        'password',
        'active',
    ];

    /** @var list<string> */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'active' => 'boolean',
        ];
    }

    /** Rôle unique de l'utilisateur (V1). */
    public function primaryRole(): ?RoleName
    {
        $name = $this->getRoleNames()->first();

        return is_string($name) ? RoleName::tryFrom($name) : null;
    }

    public function isAdmin(): bool
    {
        return $this->primaryRole() === RoleName::Admin;
    }
}
