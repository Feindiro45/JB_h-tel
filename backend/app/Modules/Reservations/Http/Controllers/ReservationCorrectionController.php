<?php

namespace App\Modules\Reservations\Http\Controllers;

use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\Services\ReservationDeletionService;
use App\Modules\Reservations\Application\Services\ReservationModificationService;
use App\Modules\Reservations\Http\Requests\ModifyReservationRequest;
use App\Modules\Reservations\Http\ReservationPresenter;
use App\Modules\Reservations\Models\Reservation;
use App\Shared\Http\DeletionRequest;
use Illuminate\Http\JsonResponse;

/** Corrections d'une réservation (D-058) : modification avant le séjour et suppression par l'administrateur. */
final class ReservationCorrectionController
{
    public function __construct(
        private readonly ReservationPresenter $presenter,
        private readonly ReservationModificationService $modifications,
        private readonly ReservationDeletionService $deletions,
    ) {}

    public function preview(ModifyReservationRequest $request, Reservation $reservation): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $quote = $this->modifications->preview($reservation->load('occupants'), $request->toData(), $actor);

        return new JsonResponse(['data' => ReservationPresenter::quote($quote) + [
            'current_net_fcfa' => $reservation->net_fcfa,
        ]]);
    }

    public function modify(ModifyReservationRequest $request, Reservation $reservation): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $outcome = $this->modifications->modify($reservation, $request->toData(), $actor);

        return new JsonResponse([
            'data' => $this->presenter->one($outcome->reservation->load('occupants')),
            'meta' => ['replacement_invoice_number' => $outcome->replacementInvoiceNumber],
        ]);
    }

    public function destroy(DeletionRequest $request, Reservation $reservation): JsonResponse
    {
        $this->deletions->delete($reservation, $request->reason(), $request->actor());

        return new JsonResponse(['message' => 'Réservation supprimée. Une copie est conservée dans le journal d’audit.']);
    }
}
