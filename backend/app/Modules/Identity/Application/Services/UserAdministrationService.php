<?php

namespace App\Modules\Identity\Application\Services;

use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\DTO\CreateUserData;
use App\Modules\Identity\DTO\UpdateUserData;
use App\Modules\Identity\Events\UserInvited;
use App\Modules\Identity\Models\User;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Création et modification des utilisateurs par l'administrateur.
 * Aucun utilisateur n'est supprimé ; l'application ne peut jamais se retrouver sans administrateur actif.
 */
final class UserAdministrationService
{
    public function __construct(private readonly AuditTrail $audit) {}

    public function create(CreateUserData $data): User
    {
        return DB::transaction(function () use ($data): User {
            $user = User::query()->create([
                'name' => $data->name,
                'email' => $data->email,
                // Sans mot de passe saisi : valeur aléatoire inconnue de tous, remplacée par la personne
                // depuis le lien de l'invitation (6M).
                'password' => $data->password ?? Str::password(40),
                'active' => $data->active,
            ]);
            $user->syncRoles([$data->role->value]);

            $this->audit->record('user.created', 'user', $user->id, after: $this->snapshot($user));
            event(new UserInvited($user->id, withPasswordLink: $data->password === null));

            return $user;
        });
    }

    /** Renvoie l'invitation (6M) : nouveau lien pour choisir son mot de passe, l'ancien devient caduc. */
    public function invite(User $user, User $actor): void
    {
        $this->audit->record('user.invitation_requested', 'user', $user->id, actorId: $actor->id);
        event(new UserInvited($user->id, withPasswordLink: true));
    }

    public function update(User $user, UpdateUserData $data, User $actor): User
    {
        return DB::transaction(function () use ($user, $data, $actor): User {
            /** @var User $user */
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $before = $this->snapshot($user);

            $currentRole = $user->primaryRole();
            $newRole = $data->role ?? $currentRole;
            $newActive = $data->active ?? $user->active;
            $losesAdminAccess = $currentRole === RoleName::Admin && $user->active
                && ($newRole !== RoleName::Admin || ! $newActive);

            if ($losesAdminAccess && $user->is($actor)) {
                throw new BusinessRuleException(
                    'Vous ne pouvez pas désactiver votre propre compte ni retirer votre rôle administrateur.',
                    'Modification refusée',
                    409,
                    'self_lockout',
                );
            }

            if ($losesAdminAccess && $this->otherActiveAdminCount($user) === 0) {
                throw new BusinessRuleException(
                    "Cet utilisateur est le dernier administrateur actif. Nommez d'abord un autre administrateur.",
                    'Modification refusée',
                    409,
                    'last_active_admin',
                );
            }

            $user->fill(array_filter([
                'name' => $data->name,
                'email' => $data->email,
                'password' => $data->password,
                'active' => $data->active,
            ], fn ($value) => $value !== null));
            $user->save();

            if ($newRole !== null && $newRole !== $currentRole) {
                $user->syncRoles([$newRole->value]);
            }

            $after = $this->snapshot($user->refresh());
            if ($data->password !== null) {
                $after['password_changed'] = true;
            }
            $this->audit->record('user.updated', 'user', $user->id, $before, $after);

            return $user;
        });
    }

    private function otherActiveAdminCount(User $user): int
    {
        return User::role(RoleName::Admin->value)
            ->where('active', true)
            ->whereKeyNot($user->id)
            ->lockForUpdate()
            ->count();
    }

    /** @return array{name: string, email: string, active: bool, role: string|null} */
    private function snapshot(User $user): array
    {
        $user->unsetRelation('roles');

        return [
            'name' => $user->name,
            'email' => $user->email,
            'active' => $user->active,
            'role' => $user->primaryRole()?->value,
        ];
    }
}
