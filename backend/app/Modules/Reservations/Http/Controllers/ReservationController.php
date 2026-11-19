<?php

namespace App\Modules\Reservations\Http\Controllers;

use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Application\Services\ReservationBookingService;
use App\Modules\Reservations\Application\Services\ReservationLifecycleService;
use App\Modules\Reservations\Application\Services\ReservationQuoter;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\Http\Requests\CancelReservationRequest;
use App\Modules\Reservations\Http\Requests\OccupantsRequest;
use App\Modules\Reservations\Http\Requests\QuoteReservationRequest;
use App\Modules\Reservations\Http\Requests\ReservationRequest;
use App\Modules\Reservations\Http\ReservationPresenter;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Shared\Audit\AuditLog;
use App\Shared\Exceptions\BusinessRuleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ReservationController
{
    public function __construct(
        private readonly ReservationPresenter $presenter,
        private readonly ReservationBookingService $booking,
        private readonly ReservationLifecycleService $lifecycle,
    ) {}

    /** Liste filtrable : statut, chambre, client (UUID), période qui chevauche `from`–`to`. */
    public function index(Request $request, RoomDirectory $rooms, CustomerDirectory $customers): JsonResponse
    {
        $status = ReservationStatus::tryFrom($request->string('status')->toString());
        $room = $request->filled('room_id') ? $rooms->findByUuid($request->string('room_id')->toString()) : null;
        $customer = $request->filled('customer_id') ? $customers->findByUuid($request->string('customer_id')->toString()) : null;

        if (($request->filled('room_id') && $room === null) || ($request->filled('customer_id') && $customer === null)) {
            return new JsonResponse(['data' => [], 'meta' => ['total' => 0, 'current_page' => 1, 'last_page' => 1]]);
        }

        $page = Reservation::query()
            ->with('occupants')
            ->when($status !== null, fn ($q) => $q->where('status', $status?->value))
            ->when($room !== null, fn ($q) => $q->where('room_id', $room?->id))
            ->when($customer !== null, fn ($q) => $q->where('customer_id', $customer?->id))
            ->when($request->filled('from'), fn ($q) => $q->where('blocked_until', '>', $request->date('from')))
            ->when($request->filled('to'), fn ($q) => $q->where('blocked_from', '<', $request->date('to')?->addDay()))
            ->orderByDesc('blocked_from')
            ->paginate(25)
            ->withQueryString();

        return new JsonResponse([
            'data' => $this->presenter->many($page->items()),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    public function show(Reservation $reservation): JsonResponse
    {
        return new JsonResponse(['data' => $this->presenter->one($reservation)]);
    }

    /** Historique d'un client (fiche client). */
    public function forCustomer(string $customer, CustomerDirectory $customers): JsonResponse
    {
        $snapshot = $customers->findByUuid($customer) ?? throw new BusinessRuleException(
            "Le client demandé n'existe pas.", 'Élément introuvable', 404, 'customer_not_found',
        );
        $reservations = Reservation::query()->with('occupants')->where('customer_id', $snapshot->id)->orderByDesc('blocked_from')->get();

        return new JsonResponse(['data' => $this->presenter->many($reservations)]);
    }

    public function quote(QuoteReservationRequest $request, ReservationQuoter $quoter): JsonResponse
    {
        return new JsonResponse(['data' => ReservationPresenter::quote($quoter->quote($request->toData(), $this->actor($request)))]);
    }

    public function store(ReservationRequest $request): JsonResponse
    {
        $reservation = $this->booking->create($request->toData(), $this->actor($request));

        return new JsonResponse(['data' => $this->presenter->one($reservation)], 201);
    }

    public function confirm(Request $request, Reservation $reservation): JsonResponse
    {
        return $this->respond($this->booking->confirm($reservation, $this->actor($request)));
    }

    public function checkIn(Request $request, Reservation $reservation): JsonResponse
    {
        return $this->respond($this->lifecycle->checkIn($reservation, $this->actor($request)));
    }

    public function checkOut(Request $request, Reservation $reservation): JsonResponse
    {
        return $this->respond($this->lifecycle->checkOut($reservation, $this->actor($request)));
    }

    public function cancel(CancelReservationRequest $request, Reservation $reservation): JsonResponse
    {
        return $this->respond($this->lifecycle->cancel($reservation, $request->reason(), $this->actor($request)));
    }

    public function occupants(OccupantsRequest $request, Reservation $reservation): JsonResponse
    {
        return $this->respond($this->lifecycle->replaceOccupants($reservation, $request->occupants(), $this->actor($request)));
    }

    /** Journal des modifications et des annulations (cahier des charges). */
    public function history(Reservation $reservation): JsonResponse
    {
        $entries = AuditLog::query()
            ->with('actor')
            ->where('entity_type', 'reservation')
            ->where('entity_id', $reservation->id)
            ->orderBy('id')
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => $log->uuid,
                'action' => $log->action,
                'label' => self::ACTION_LABELS[$log->action] ?? $log->action,
                'actor' => $log->actor === null ? null : ['id' => $log->actor->uuid, 'name' => $log->actor->name],
                'occurred_at' => $log->occurred_at->toIso8601String(),
                'before' => self::publicState($log->before_json),
                'after' => self::publicState($log->after_json),
            ]);

        return new JsonResponse(['data' => $entries]);
    }

    private const ACTION_LABELS = [
        'reservation.created' => 'Réservation créée',
        'reservation.confirmed' => 'Réservation confirmée',
        'reservation.checked_in' => 'Arrivée enregistrée',
        'reservation.checked_out' => 'Départ enregistré',
        'reservation.cancelled' => 'Réservation annulée',
        'reservation.extended' => 'Séjour prolongé',
        'reservation.occupants_updated' => 'Occupants modifiés',
    ];

    /**
     * Retire les clés internes (identifiants entiers) des états journalisés (D-026).
     *
     * @param  array<string, mixed>|null  $state
     * @return array<string, mixed>|null
     */
    private static function publicState(?array $state): ?array
    {
        return $state === null ? null : array_diff_key($state, array_flip(['room_id', 'customer_id', 'rate_id']));
    }

    private function respond(Reservation $reservation): JsonResponse
    {
        return new JsonResponse(['data' => $this->presenter->one($reservation->load('occupants'))]);
    }

    private function actor(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user;
    }
}
