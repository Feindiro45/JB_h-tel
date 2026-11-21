<?php

namespace App\Modules\Workstations\Application\Services;

use App\Modules\Identity\Models\User;
use App\Modules\Workstations\Models\Workstation;
use App\Modules\Workstations\Models\WorkstationAssignment;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Settings\SettingsRepository;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Postes de caisse et poste principal unique (D-062) : enregistrement des navigateurs, signal de
 * présence, désignation numérotée, révocation. Chaque changement est journalisé dans la même
 * transaction ; le signal de présence, trop fréquent, ne l'est pas.
 */
final class WorkstationService
{
    public function __construct(
        private readonly AuditTrail $audit,
        private readonly SettingsRepository $settings,
    ) {}

    /**
     * Enregistre le navigateur courant. Le jeton n'est rendu qu'une fois : seule son empreinte
     * est conservée.
     *
     * @return array{workstation: Workstation, token: string}
     */
    public function register(User $user, ?string $userAgent): array
    {
        $token = Str::random(48);

        $workstation = DB::transaction(function () use ($user, $userAgent, $token): Workstation {
            $workstation = Workstation::query()->create([
                // Nom provisoire unique, remplacé aussitôt par « Poste <n> ».
                'name' => 'tmp-'.Str::random(20),
                'token_hash' => Workstation::hashToken($token),
                'user_agent' => $userAgent === null ? null : mb_substr($userAgent, 0, 255),
                'registered_by' => $user->id,
                'last_seen_at' => now(),
                'last_seen_by' => $user->id,
            ]);
            $workstation->name = $this->freeName('Poste '.$workstation->id);
            $workstation->save();
            $this->audit->record('workstation.registered', 'workstation', $workstation->id, null, [
                'name' => $workstation->name,
                'user_agent' => $workstation->user_agent,
            ], $user->id);

            return $workstation;
        });

        return ['workstation' => $workstation, 'token' => $token];
    }

    /** Signal de présence : dernier contact et dernier utilisateur du poste. */
    public function heartbeat(Workstation $workstation, User $user): Workstation
    {
        $workstation->forceFill(['last_seen_at' => now(), 'last_seen_by' => $user->id])->save();

        return $workstation;
    }

    public function rename(Workstation $workstation, string $name, User $actor): Workstation
    {
        return DB::transaction(function () use ($workstation, $name, $actor): Workstation {
            $before = $workstation->name;
            $workstation->name = $name;
            $workstation->save();
            $this->audit->record('workstation.renamed', 'workstation', $workstation->id, ['name' => $before], ['name' => $name], $actor->id);

            return $workstation;
        });
    }

    /**
     * Désigne le poste principal. Transfert planifié si l'ancien poste a donné signe de vie dans
     * le délai réglé ; sinon transfert forcé, qui exige une confirmation explicite et un motif.
     * Lot 4 : le transfert planifié exigera aussi zéro opération en attente sur l'ancien poste.
     */
    public function designate(Workstation $target, User $actor, ?string $reason, bool $force): WorkstationAssignment
    {
        try {
            return DB::transaction(function () use ($target, $actor, $reason, $force): WorkstationAssignment {
                /** @var Workstation $target */
                $target = Workstation::query()->lockForUpdate()->findOrFail($target->id);
                if ($target->isRevoked()) {
                    throw new BusinessRuleException(
                        'Ce poste est révoqué : réactivez-le avant de le désigner comme poste principal.',
                        'Poste révoqué', 409, 'workstation_revoked',
                    );
                }

                $current = WorkstationAssignment::query()->orderByDesc('number')->lockForUpdate()->first();
                if ($current?->workstation_id === $target->id) {
                    throw new BusinessRuleException(
                        "« {$target->name} » est déjà le poste principal.",
                        'Déjà poste principal', 409, 'workstation_already_main',
                    );
                }

                $previous = $current === null ? null : Workstation::query()->lockForUpdate()->find($current->workstation_id);
                $mode = WorkstationAssignment::FIRST;
                if ($previous !== null) {
                    $mode = $this->isSilent($previous) ? WorkstationAssignment::FORCED : WorkstationAssignment::PLANNED;
                }
                if ($mode === WorkstationAssignment::FORCED && (! $force || $reason === null || mb_strlen(trim($reason)) < 5)) {
                    throw new BusinessRuleException(
                        "Le poste principal actuel « {$previous->name} » ne donne plus signe de vie. Ses opérations non synchronisées seront mises de côté pour examen : confirmez le transfert forcé et indiquez un motif.",
                        'Transfert forcé à confirmer', 409, 'workstation_transfer_needs_force',
                        [
                            "Poste principal actuel : « {$previous->name} »",
                            'Dernier signal : '.($previous->last_seen_at?->timezone((string) config('app.timezone'))->format('d/m/Y H:i') ?? 'jamais'),
                        ],
                    );
                }

                $assignment = WorkstationAssignment::query()->create([
                    'number' => ($current->number ?? 0) + 1,
                    'workstation_id' => $target->id,
                    'previous_workstation_id' => $previous?->id,
                    'mode' => $mode,
                    'reason' => $reason === null || trim($reason) === '' ? null : trim($reason),
                    'previous_last_seen_at' => $previous?->last_seen_at,
                    'assigned_by' => $actor->id,
                    'assigned_at' => now(),
                ]);
                $this->audit->record('workstation.designated', 'workstation', $target->id, [
                    'main' => $previous?->name,
                    'number' => $current?->number,
                ], [
                    'main' => $target->name,
                    'number' => $assignment->number,
                    'mode' => $mode,
                    'reason' => $assignment->reason,
                ], $actor->id);

                return $assignment;
            });
        } catch (UniqueConstraintViolationException $e) {
            throw new BusinessRuleException(
                'Une autre désignation vient d’être enregistrée. Rechargez la page pour voir le poste principal actuel.',
                'Désignation simultanée', 409, 'workstation_transfer_conflict', [], $e,
            );
        }
    }

    public function revoke(Workstation $workstation, string $reason, User $actor): Workstation
    {
        return DB::transaction(function () use ($workstation, $reason, $actor): Workstation {
            /** @var Workstation $workstation */
            $workstation = Workstation::query()->lockForUpdate()->findOrFail($workstation->id);
            if (WorkstationAssignment::current()?->workstation_id === $workstation->id) {
                throw new BusinessRuleException(
                    'Le poste principal ne peut pas être révoqué : désignez d’abord un autre poste principal.',
                    'Poste principal', 409, 'workstation_is_main',
                );
            }
            if ($workstation->isRevoked()) {
                throw new BusinessRuleException('Ce poste est déjà révoqué.', 'Déjà révoqué', 409, 'workstation_already_revoked');
            }
            $workstation->forceFill(['revoked_at' => now(), 'revoked_by' => $actor->id, 'revocation_reason' => $reason])->save();
            $this->audit->record('workstation.revoked', 'workstation', $workstation->id, ['revoked' => false], [
                'revoked' => true,
                'reason' => $reason,
            ], $actor->id);

            return $workstation;
        });
    }

    public function reactivate(Workstation $workstation, User $actor): Workstation
    {
        return DB::transaction(function () use ($workstation, $actor): Workstation {
            /** @var Workstation $workstation */
            $workstation = Workstation::query()->lockForUpdate()->findOrFail($workstation->id);
            if (! $workstation->isRevoked()) {
                throw new BusinessRuleException('Ce poste n’est pas révoqué.', 'Poste actif', 409, 'workstation_not_revoked');
            }
            $before = ['revoked' => true, 'reason' => $workstation->revocation_reason];
            $workstation->forceFill(['revoked_at' => null, 'revoked_by' => null, 'revocation_reason' => null])->save();
            $this->audit->record('workstation.reactivated', 'workstation', $workstation->id, $before, ['revoked' => false], $actor->id);

            return $workstation;
        });
    }

    /** Sans signal depuis le délai réglé (provisoire, D-062), ou révoqué. */
    public function isSilent(Workstation $workstation, ?Carbon $now = null): bool
    {
        if ($workstation->isRevoked() || $workstation->last_seen_at === null) {
            return true;
        }

        return $workstation->last_seen_at->lt(($now ?? now())->copy()->subMinutes($this->silentAfterMinutes()));
    }

    public function silentAfterMinutes(): int
    {
        return max(1, $this->settings->int('workstations.silent_after_minutes', 5));
    }

    public function enforcesMainPost(): bool
    {
        return $this->settings->bool('workstations.enforce_main_post', false);
    }

    private function freeName(string $name): string
    {
        $candidate = $name;
        for ($suffix = 2; Workstation::query()->where('name', $candidate)->exists(); $suffix++) {
            $candidate = "{$name} ({$suffix})";
        }

        return $candidate;
    }
}
