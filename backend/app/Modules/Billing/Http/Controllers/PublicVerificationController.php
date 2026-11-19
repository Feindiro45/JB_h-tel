<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Application\InvoiceVerification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Vérification d'une facture **par tout public**, sans connexion (D-036) : c'est l'adresse
 * encodée dans le QR code. Une facture inconnue et un code faux reçoivent exactement la même
 * réponse (404), pour ne rien révéler.
 */
final class PublicVerificationController
{
    public function __construct(private readonly InvoiceVerification $verification) {}

    /** Page HTML ouverte en scannant le QR code. */
    public function page(Request $request, string $invoice): Response
    {
        $found = $this->verification->find($invoice, $request->string('code')->toString());
        $html = view('billing.verification', [
            'result' => $found === null ? null : InvoiceVerification::publicView($found),
        ])->render();

        return response($html, $found === null ? 404 : 200)
            ->header('X-Robots-Tag', 'noindex, nofollow')
            ->header('Cache-Control', 'no-store');
    }

    /** Même vérification au format JSON (frontend, intégrations). */
    public function api(Request $request, string $invoice): JsonResponse
    {
        $found = $this->verification->find($invoice, $request->string('code')->toString());

        if ($found === null) {
            return new JsonResponse([
                'title' => 'Document introuvable',
                'message' => "Aucun document ne correspond à ce QR code. Il peut s'agir d'un document falsifié ou d'un lien incomplet.",
                'code' => 'document_not_found',
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return new JsonResponse(['data' => InvoiceVerification::publicView($found)], 200, ['Cache-Control' => 'no-store']);
    }
}
