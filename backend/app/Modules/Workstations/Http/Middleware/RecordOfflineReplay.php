<?php

namespace App\Modules\Workstations\Http\Middleware;

use App\Modules\Workstations\Application\Services\OfflineJournal;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Note dans le journal hors ligne (lot 4A.4) chaque opération rejouée par un poste (en-tête
 * `X-Offline-Replay`). Sans cet en-tête, rien n'est fait. Une erreur d'écriture du journal ne
 * change jamais la réponse : l'opération elle-même a déjà été traitée.
 */
final class RecordOfflineReplay
{
    public function __construct(private readonly OfflineJournal $journal) {}

    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);
        if (! $request->headers->has(OfflineJournal::HEADER)) {
            return $response;
        }
        try {
            $this->journal->record($request, $response);
        } catch (\Throwable $error) {
            report($error);
        }

        return $response;
    }
}
