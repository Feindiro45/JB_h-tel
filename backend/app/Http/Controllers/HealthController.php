<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * État détaillé pour l'interface (`GET /api/v1/health`). Répond 200 tant que l'application
 * tourne, avec `status: degraded` si la base est inaccessible. La sonde d'infrastructure
 * reste `GET /up` (fournie par Laravel).
 */
final class HealthController
{
    public function __invoke(): JsonResponse
    {
        $databaseAvailable = $this->databaseIsReachable();

        return new JsonResponse([
            'status' => $databaseAvailable ? 'ok' : 'degraded',
            'application' => config('app.name'),
            'api_version' => 'v1',
            'database' => $databaseAvailable ? 'ok' : 'indisponible',
            'server_time' => now()->toIso8601String(),
        ]);
    }

    private function databaseIsReachable(): bool
    {
        try {
            DB::select('SELECT 1');

            return true;
        } catch (Throwable $e) {
            Log::warning('Contrôle de santé : base de données inaccessible.', ['exception' => $e->getMessage()]);

            return false;
        }
    }
}
