<?php

namespace App\Modules\Identity\Application\Services;

use App\Modules\Identity\Domain\RoleName;
use App\Modules\Identity\DTO\CreateUserData;
use App\Modules\Identity\DTO\UpdateUserData;
use App\Modules\Identity\Events\UserInvited;
use App\Modules\Identity\Models\User;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Support\RecordDeletion;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Création et modification des utilisateurs par l'administrateur.
 * Aucun utilisateur n'est supprimé ; l'application ne peut jamais se retrouver sans administrateur actif.
 */
final class UserAdministrationService
{
    public function __construct(
        private readonly AuditTrail $audit,
        private readonly RecordDeletion $deletion,
    ) {}

    /**
     * Suppression définitive (D-058) : seulement un compte jamais utilisé (aucune connexion, aucune
     * opération). Un compte qui a servi se désactive : son historique lui reste attribué.
     */
    public function delete(User $user, string $reason, User $actor): void
    {
        if ($user->is($actor)) {
            throw new BusinessRuleException('Vous ne pouvez pas supprimer votre propre compte.', 'Suppression impossible', 409, 'cannot_delete_self');
        }
        if ($user->last_login_at !== null) {
            throw new BusinessRuleException(
                "Le compte de {$user->name} a déjà été utilisé : il ne peut pas être supprimé. Désactivez-le plutôt, son historique reste attribué.",
                'Suppression impossible',
                409,
                'user_has_activity',
            );
        }
        if ($user->primaryRole() === RoleName::Admin && $user->active && $this->otherActiveAdminCount($user) === 0) {
            throw new BusinessRuleException("Cet utilisateur est le dernier administrateur actif. Nommez d'abord un autre administrateur.", 'Suppression impossible', 409, 'last_active_admin');
        }

        DB::transaction(function () use ($user, $reason, $actor): void {
            $snapshot = $this->snapshot($user);
            $user->syncRoles([]);
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();
            DB::table('invitation_tokens')->where('email', $user->email)->delete();
            $this->deletion->delete($user, 'user.deleted', 'user', $snapshot, $reason, $actor,
                "Le compte de {$user->name} a déjà des opérations enregistrées : désactivez-le plutôt.");
        });
    }

    public function create(CreateUserData $data, User $actor): User
    {
        $this->authorizePrivilegedRole($actor, null, $data->role);

        return $this->persist($data);
    }

    /** Seule la commande CLI privée peut amorcer un administrateur sans session préexistante. */
    public function createFromConsole(CreateUserData $data): User
    {
        if (! app()->runningInConsole() || $data->role !== RoleName::Admin) {
            throw new \LogicException('Création initiale réservée à la console.');
        }

        return $this->persist($data);
    }

    private function persist(CreateUserData $data): User
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
        $this->authorizePrivilegedRole($actor, $user);
        $this->audit->record('user.invitation_requested', 'user', $user->id, actorId: $actor->id);
        event(new UserInvited($user->id, withPasswordLink: true));
    }

    public function update(User $user, UpdateUserData $data, User $actor): User
    {
        $this->authorizePrivilegedRole($actor, $user, $data->role);

        return DB::transaction(function () use ($user, $data, $actor): User {
            /** @var User $user */
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $this->authorizePrivilegedRole($actor, $user, $data->role);
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

    private function authorizePrivilegedRole(User $actor, ?User $target = null, ?RoleName $role = null): void
    {
        if (! $actor->hasRole(RoleName::Admin->value)
            && ($role === RoleName::Admin || $target?->hasRole(RoleName::Admin->value))) {
            throw new BusinessRuleException('Seul un administrateur peut attribuer ce rôle ou modifier un compte administrateur.', 'Droit réservé', 403, 'admin_role_required');
        }
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
