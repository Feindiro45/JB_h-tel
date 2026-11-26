<?php

namespace App\Modules\Workstations\Http\Middleware;

use App\Modules\Workstations\Application\Services\WorkstationService;
use App\Modules\Workstations\Models\Workstation;
use App\Modules\Workstations\Models\WorkstationAssignment;
use App\Shared\Exceptions\BusinessRuleException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * D-062 : quand l'administrateur l'active, réservations et encaissements ne s'enregistrent que
 * depuis le poste principal. Sans poste principal désigné, la règle est sans effet. Utilisé par
 * les autres modules sous l'alias `main.workstation` (aucune dépendance de code vers ce module).
 */
final class EnsureMainWorkstation
{
    public function __construct(private readonly WorkstationService $service) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->service->enforcesMainPost()) {
            return $next($request);
        }
        $current = WorkstationAssignment::current();
        if ($current === null) {
            return $next($request);
        }

        $workstation = Workstation::findByToken($request->header(Workstation::HEADER));
        if ($workstation !== null && $workstation->id === $current->workstation_id && ! $workstation->isRevoked()) {
            return $next($request);
        }

        $main = Workstation::query()->find($current->workstation_id);
        $here = $workstation === null
            ? 'Ce navigateur n’est pas enregistré comme poste.'
            : "Ce poste (« {$workstation->name} ») sert à la consultation.";

        throw new BusinessRuleException(
            "Les réservations et les encaissements se font uniquement depuis le poste principal « {$main?->name} ». {$here} Effectuez l’opération sur le poste principal, ou demandez à l’administrateur de changer de poste principal.",
            'Poste non autorisé',
            403,
            'workstation_not_main',
            array_values(array_filter([
                $main === null ? null : "Poste principal : « {$main->name} »",
                $workstation === null ? 'Ce navigateur : non enregistré' : "Ce poste : « {$workstation->name} »",
            ])),
        );
    }
}
