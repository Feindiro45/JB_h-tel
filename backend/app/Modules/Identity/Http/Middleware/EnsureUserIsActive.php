<?php

namespace App\Modules\Identity\Http\Middleware;

use App\Modules\Identity\Models\User;
use App\Shared\Exceptions\BusinessRuleException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/** Un compte désactivé perd l'accès immédiatement, même avec une session encore ouverte. */
final class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User && ! $user->active) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
            }

            throw new BusinessRuleException(
                "Ce compte est désactivé. Contactez l'administrateur.",
                'Compte désactivé',
                403,
                'account_disabled',
            );
        }

        return $next($request);
    }
}
