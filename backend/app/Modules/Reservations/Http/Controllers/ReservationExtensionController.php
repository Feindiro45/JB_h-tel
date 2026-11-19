<?php

namespace App\Modules\Reservations\Http\Controllers;

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\Services\ReservationExtensionService;
use App\Modules\Reservations\Http\Requests\ExtendReservationRequest;
use App\Modules\Reservations\Http\ReservationPresenter;
use App\Modules\Reservations\Models\Reservation;
use Illuminate\Http\JsonResponse;

/**
 * Prolongation en deux temps : `preview` affiche le supplément et les conflits sans rien modifier ;
 * l'application exige ensuite `confirm: true` (validation explicite de la caissière).
 */
final class ReservationExtensionController
{
    public function __construct(
        private readonly ReservationExtensionService $extensions,
        private readonly ReservationPresenter $presenter,
    ) {}

    public function preview(ExtendReservationRequest $request, Reservation $reservation): JsonResponse
    {
        return new JsonResponse(['data' => ReservationPresenter::extension($this->extensions->preview($reservation, $request->toData()))]);
    }

    public function store(ExtendReservationRequest $request, Reservation $reservation): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $outcome = $this->extensions->extend($reservation, $request->toData(), $actor);

        return new JsonResponse([
            'data' => $this->presenter->one($outcome->reservation->load('occupants')),
            // D-053 : nouvelle facture (séjour initial + prolongation) si le séjour était facturé.
            'meta' => ['replacement_invoice_number' => $outcome->replacementInvoiceNumber],
        ]);
    }
}
