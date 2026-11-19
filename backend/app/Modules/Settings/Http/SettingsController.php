<?php

namespace App\Modules\Settings\Http;

use App\Modules\Identity\Models\User;
use App\Modules\Settings\Application\SettingsCatalog;
use App\Modules\Settings\Application\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Écran « Paramètres » de l'administration. */
final class SettingsController
{
    public function __construct(private readonly SettingsService $settings) {}

    public function index(): JsonResponse
    {
        return new JsonResponse(['data' => $this->settings->all()]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        $definition = SettingsCatalog::definition($key);
        if ($definition !== null && $definition['editable']) {
            $request->validate(SettingsCatalog::rules($key), attributes: ['value' => mb_strtolower($definition['label']), 'value.*' => 'moyen de paiement']);
        }
        /** @var User $actor */
        $actor = $request->user();
        $value = $request->input('value');
        $this->settings->update($key, is_array($value) ? array_values($value) : (is_numeric($value) ? (int) $value : $value), $actor);

        $updated = collect($this->settings->all())->firstWhere('key', $key);

        return new JsonResponse(['data' => $updated]);
    }
}
