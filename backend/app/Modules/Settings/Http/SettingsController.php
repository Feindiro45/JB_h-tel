<?php

namespace App\Modules\Settings\Http;

use App\Modules\Identity\Models\User;
use App\Modules\Settings\Application\MailCheck;
use App\Modules\Settings\Application\SettingsCatalog;
use App\Modules\Settings\Application\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Écran « Paramètres » de l'administration. */
final class SettingsController
{
    public function __construct(
        private readonly SettingsService $settings,
        private readonly MailCheck $mail,
    ) {}

    /** État de l'envoi des e-mails (6M) : mode, serveur, expéditeur, file d'attente ; aucun secret. */
    public function mailStatus(): JsonResponse
    {
        return new JsonResponse(['data' => $this->mail->status()]);
    }

    /** Relance les envois en échec (après correction du serveur SMTP). */
    public function mailRetry(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $count = $this->mail->retryFailed($actor);

        return new JsonResponse([
            'message' => $count === 0 ? 'Aucun envoi en échec à relancer.' : ($count === 1 ? '1 envoi relancé.' : "{$count} envois relancés."),
            'data' => $this->mail->status(),
        ]);
    }

    /** E-mail de test envoyé immédiatement ; par défaut à l'adresse de l'administrateur connecté. */
    public function mailTest(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $validated = $request->validate(['to' => ['nullable', 'email', 'max:255']], attributes: ['to' => 'adresse de test']);
        $to = (string) ($validated['to'] ?? $actor->email);
        $this->mail->sendTest($to, $actor);

        return new JsonResponse(['message' => "E-mail de test envoyé à {$to}.", 'data' => $this->mail->status()]);
    }

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
