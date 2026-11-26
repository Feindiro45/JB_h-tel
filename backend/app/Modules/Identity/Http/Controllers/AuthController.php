<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Application\Services\AuthenticationService;
use App\Modules\Identity\Http\Requests\ConfirmPasswordRequest;
use App\Modules\Identity\Http\Requests\LoginRequest;
use App\Modules\Identity\Http\Requests\SetPasswordRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\User;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Authentification Sanctum en mode SPA : le frontend appelle d'abord `GET /sanctum/csrf-cookie`,
 * puis `POST /api/v1/auth/login`. La session est portée par un cookie HttpOnly.
 */
final class AuthController
{
    public function __construct(private readonly AuthenticationService $auth) {}

    /** Lien de l'invitation (6M) : la personne choisit son mot de passe, puis se connecte. */
    public function setPassword(SetPasswordRequest $request): JsonResponse
    {
        $this->auth->setPassword(
            $request->string('email')->toString(),
            $request->string('token')->toString(),
            $request->string('password')->toString(),
            $request->string('purpose')->toString() === 'reset' ? 'reset' : 'invitation',
        );

        return new JsonResponse(['message' => 'Mot de passe enregistré. Vous pouvez vous connecter.']);
    }

    /** « Mot de passe oublié » (D-059) : le compte est vérifié avant l'envoi du lien. */
    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'string', 'email', 'max:255']], attributes: ['email' => 'adresse e-mail']);
        $user = $this->auth->requestPasswordReset((string) $validated['email']);

        return new JsonResponse([
            'message' => "Un e-mail contenant un lien de réinitialisation vient d’être envoyé à {$user->email}. Ce lien est valable 60 minutes.",
        ], 202);
    }

    public function login(LoginRequest $request): UserResource
    {
        // Sans session (requête hors de l'application frontend), aucune connexion n'est possible.
        if (! $request->hasSession()) {
            throw new BusinessRuleException(
                "La connexion n'est possible que depuis l'application JB Hôtel.",
                'Connexion impossible',
                400,
                'session_unavailable',
            );
        }

        $user = $this->auth->login(
            $request->string('email')->trim()->toString(),
            $request->string('password')->toString(),
            $request->boolean('remember'),
            (string) $request->ip(),
            $request->userAgent(),
        );
        $request->session()->regenerate();

        return new UserResource($user->load('roles.permissions', 'permissions'));
    }

    public function logout(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        $this->auth->logout($user);

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }

    /** Sortie de veille (D-074) : 204 si le mot de passe est le bon, 422 sinon. */
    public function confirmPassword(ConfirmPasswordRequest $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        $this->auth->confirmPassword($user, $request->password());

        return response()->noContent();
    }

    public function me(Request $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();

        return new UserResource($user->load('roles.permissions', 'permissions'));
    }
}
