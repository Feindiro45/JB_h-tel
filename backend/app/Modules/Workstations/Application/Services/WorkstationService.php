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

    /**
     * Signal de présence : dernier contact et dernier utilisateur du poste ; avec l'état déclaré
     * par le poste (lot 4A) : opérations en attente et refusées, dernière synchronisation,
     * dernière sauvegarde, stockage protégé. L'administrateur le voit dans « Mode hors ligne ».
     *
     * @param  array{pending_operations: int, rejected_operations: int, oldest_pending_at: ?string, last_sync_at: ?string, last_sync_status: ?string, last_backup_at: ?string, storage_persisted: ?bool}|null  $report
     */
    public function heartbeat(Workstation $workstation, User $user, ?array $report = null): Workstation
    {
        $workstation->forceFill(['last_seen_at' => now(), 'last_seen_by' => $user->id]);
        if ($report !== null) {
            $workstation->forceFill([
                'pending_operations' => $report['pending_operations'],
                'rejected_operations' => $report['rejected_operations'],
                'oldest_pending_at' => self::date($report['oldest_pending_at']),
                'last_sync_at' => self::date($report['last_sync_at']),
                'last_sync_status' => $report['last_sync_status'],
                'last_backup_at' => self::date($report['last_backup_at']),
                'storage_persisted' => $report['storage_persisted'],
                'reported_at' => now(),
            ]);
        }
        $workstation->save();

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

    /**
     * Règles hors ligne (lot 4A.5, provisoires) envoyées au poste avec son signal de présence :
     * gardées sur le poste, elles s'appliquent aussi sans réseau.
     *
     * `allowed_operations` à null : paramètre absent, toutes les opérations sont permises (N-02).
     *
     * @return array{allowed_operations: list<string>|null, lock_after_minutes: int, backup_reminder_minutes: int, provisional_prefix: string}
     */
    public function offlineRules(): array
    {
        $allowed = $this->settings->get('offline.allowed_operations');

        return [
            'allowed_operations' => is_array($allowed) ? array_values(array_filter($allowed, 'is_string')) : null,
            // D-074 : délai de mise en veille, le même en ligne et hors ligne.
            'lock_after_minutes' => max(1, $this->settings->int('security.idle_lock_minutes', 15)),
            'backup_reminder_minutes' => max(15, $this->settings->int('offline.backup_reminder_minutes', 60)),
            'provisional_prefix' => $this->settings->string('offline.provisional_prefix', 'LOC'),
        ];
    }

    private static function date(?string $value): ?Carbon
    {
        return $value === null ? null : Carbon::parse($value)->setTimezone((string) config('app.timezone'));
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
