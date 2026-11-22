<?php

namespace App\Modules\Workstations\Http\Controllers;

use App\Modules\Identity\Models\User;
use App\Modules\Workstations\Application\Services\WorkstationService;
use App\Modules\Workstations\Http\WorkstationPresenter;
use App\Modules\Workstations\Models\Workstation;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Postes de caisse (D-062) : enregistrement, signal de présence et administration. */
final class WorkstationController
{
    public function __construct(
        private readonly WorkstationService $service,
        private readonly WorkstationPresenter $presenter,
    ) {}

    /** Enregistre le navigateur ; le jeton n'est renvoyé qu'ici, une seule fois. */
    public function register(Request $request): JsonResponse
    {
        $registered = $this->service->register($this->actor($request), $request->userAgent());

        return new JsonResponse([
            'data' => $this->presenter->self($registered['workstation']),
            'token' => $registered['token'],
        ], 201);
    }

    /** Signal de présence, avec l'état hors ligne déclaré par le poste (lot 4A, facultatif). */
    public function heartbeat(Request $request): JsonResponse
    {
        $workstation = $this->fromHeader($request);
        $validated = $request->validate([
            'report' => ['sometimes', 'nullable', 'array'],
            'report.pending_operations' => ['required_with:report', 'integer', 'min:0', 'max:1000000'],
            'report.rejected_operations' => ['required_with:report', 'integer', 'min:0', 'max:1000000'],
            'report.oldest_pending_at' => ['nullable', 'date'],
            'report.last_sync_at' => ['nullable', 'date'],
            'report.last_sync_status' => ['nullable', 'in:success,partial,failure'],
            'report.last_backup_at' => ['nullable', 'date'],
            'report.storage_persisted' => ['nullable', 'boolean'],
        ], [], ['report' => 'état du poste']);
        /** @var array<string, mixed>|null $raw */
        $raw = $validated['report'] ?? null;
        $report = $raw === null ? null : [
            'pending_operations' => (int) $raw['pending_operations'],
            'rejected_operations' => (int) $raw['rejected_operations'],
            'oldest_pending_at' => self::nullableString($raw['oldest_pending_at'] ?? null),
            'last_sync_at' => self::nullableString($raw['last_sync_at'] ?? null),
            'last_sync_status' => self::nullableString($raw['last_sync_status'] ?? null),
            'last_backup_at' => self::nullableString($raw['last_backup_at'] ?? null),
            'storage_persisted' => isset($raw['storage_persisted']) ? (bool) $raw['storage_persisted'] : null,
        ];

        return new JsonResponse(['data' => $this->presenter->self($this->service->heartbeat($workstation, $this->actor($request), $report))]);
    }

    private static function nullableString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    public function index(Request $request): JsonResponse
    {
        return new JsonResponse(['data' => $this->presenter->overview(Workstation::findByToken($request->header(Workstation::HEADER)))]);
    }

    public function rename(Request $request, Workstation $workstation): JsonResponse
    {
        $validated = $request->validate([
            'name' => [
                'required', 'string', 'min:2', 'max:40', 'regex:/^[\pL\pN][\pL\pN \-_.()]*$/u',
                Rule::unique('workstations', 'name')->ignore($workstation->id),
            ],
        ], ['name.regex' => 'Le nom ne contient que des lettres, chiffres, espaces, tirets, points ou parenthèses.'], ['name' => 'nom du poste']);

        $this->service->rename($workstation, trim((string) $validated['name']), $this->actor($request));

        return $this->index($request);
    }

    public function designate(Request $request, Workstation $workstation): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
            'force' => ['sometimes', 'boolean'],
        ], attributes: ['reason' => 'motif', 'force' => 'confirmation du transfert forcé']);

        $this->service->designate($workstation, $this->actor($request), $validated['reason'] ?? null, (bool) ($validated['force'] ?? false));

        return $this->index($request);
    }

    public function revoke(Request $request, Workstation $workstation): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']], attributes: ['reason' => 'motif']);
        $this->service->revoke($workstation, trim((string) $validated['reason']), $this->actor($request));

        return $this->index($request);
    }

    public function reactivate(Request $request, Workstation $workstation): JsonResponse
    {
        $this->service->reactivate($workstation, $this->actor($request));

        return $this->index($request);
    }

    private function fromHeader(Request $request): Workstation
    {
        return Workstation::findByToken($request->header(Workstation::HEADER)) ?? throw new BusinessRuleException(
            'Ce navigateur n’est pas enregistré comme poste. Il va être enregistré de nouveau.',
            'Poste inconnu', 404, 'workstation_unknown',
        );
    }

    private function actor(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user;
    }
}
