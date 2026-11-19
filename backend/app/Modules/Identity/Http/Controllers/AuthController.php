<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Modules\Identity\Application\Services\AuthenticationService;
use App\Modules\Identity\Http\Requests\LoginRequest;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\User;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Authentification Sanctum en mode SPA : le frontend appelle d'abord `GET /sanctum/csrf-cookie`,
 * puis `POST /api/v1/auth/login`. La session est portée par un cookie HttpOnly.
 */
final class AuthController
{
    public function __construct(private readonly AuthenticationService $auth) {}

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

    public function me(Request $request): UserResource
    {
        /** @var User $user */
        $user = $request->user();

        return new UserResource($user->load('roles.permissions', 'permissions'));
    }
}
