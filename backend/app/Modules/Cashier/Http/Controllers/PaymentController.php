<?php

namespace App\Modules\Cashier\Http\Controllers;

use App\Modules\Cashier\Application\Services\CashierService;
use App\Modules\Cashier\Domain\PaymentMethods;
use App\Modules\Cashier\Http\PaymentPresenter;
use App\Modules\Cashier\Models\Payment;
use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\ReservationDue;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Settings\HotelIdentity;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Écran « Encaissements » : situation de caisse d'une réservation, paiements, reçus, remboursements. */
final class PaymentController
{
    public function __construct(
        private readonly CashierService $cashier,
        private readonly ReservationLedger $reservations,
    ) {}

    /** Moyens de paiement acceptés (paramètre `payments.methods`), pour les listes des écrans. */
    public function methods(PaymentMethods $methods): JsonResponse
    {
        return new JsonResponse([
            'data' => array_map(fn (string $method) => ['value' => $method, 'label' => PaymentMethods::label($method)], $methods->accepted()),
        ]);
    }

    public function index(string $reservation): JsonResponse
    {
        $due = $this->reservation($reservation);
        $payments = Payment::query()->with(['refunds.processor', 'cashier'])->where('reservation_id', $due->id)->orderBy('id')->get();

        return new JsonResponse([
            'data' => $payments->map(fn (Payment $payment) => PaymentPresenter::payment($payment))->values()->all(),
            'summary' => $this->cashier->summary($due)->toArray(),
        ]);
    }

    public function store(Request $request, string $reservation, PaymentMethods $methods): JsonResponse
    {
        $due = $this->reservation($reservation);
        $validated = $request->validate([
            'amount_fcfa' => ['required', 'integer', 'min:1', 'max:1000000000'],
            'method' => ['required', 'string', Rule::in($methods->accepted())],
            'reference' => ['nullable', 'string', 'max:120'],
        ], attributes: ['amount_fcfa' => 'montant', 'method' => 'moyen de paiement', 'reference' => 'référence']);

        $payment = $this->cashier->record($due, (int) $validated['amount_fcfa'], (string) $validated['method'], $validated['reference'] ?? null, $this->actor($request));

        return new JsonResponse([
            'data' => PaymentPresenter::payment($payment),
            'summary' => $this->cashier->summary($due)->toArray(),
        ], 201);
    }

    /** Reçu d'un paiement : données imprimables (l'impression A4 est faite par le frontend). */
    public function show(Payment $payment, CustomerDirectory $customers, RoomDirectory $rooms): JsonResponse
    {
        $due = $this->reservations->find($payment->reservation_id) ?? throw self::reservationNotFound();
        $customer = $customers->find($due->customerId);
        $room = $rooms->find($due->roomId);
        // Période du séjour, imprimée sur le ticket 80 mm (D-061) ; lue par le contrat public.
        $stay = $this->reservations->invoiceData($payment->reservation_id);

        return new JsonResponse([
            'data' => PaymentPresenter::payment($payment) + [
                'reservation' => ['id' => $due->uuid, 'status_label' => $due->statusLabel],
                'stay' => $stay === null ? null : [
                    'start_date' => $stay->startDate,
                    'start_time' => $stay->startTime,
                    'end_date' => $stay->endDate,
                    'end_time' => $stay->endTime,
                    'billing_unit_label' => $stay->billingUnitLabel,
                    'quantity' => $stay->quantity,
                ],
                'customer' => $customer === null ? null : ['id' => $customer->uuid, 'full_name' => $customer->fullName],
                'room' => $room === null ? null : ['id' => $room->uuid, 'number' => $room->number, 'room_type' => $room->roomTypeLabel],
                'summary' => $this->cashier->summary($due)->toArray(),
                // La situation du séjour est celle du moment de la consultation, pas figée au versement (D-041).
                'summary_at' => CarbonImmutable::now((string) config('app.timezone'))->toIso8601String(),
                'hotel' => app(HotelIdentity::class)->toArray(),
            ],
        ]);
    }

    public function cancel(Request $request, Payment $payment): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'max:255']], attributes: ['reason' => "motif d'annulation"]);
        $payment = $this->cashier->cancel($payment, trim((string) $validated['reason']), $this->actor($request));

        return new JsonResponse(['data' => PaymentPresenter::payment($payment->load(['refunds.processor', 'cashier']))]);
    }

    public function refund(Request $request, Payment $payment, PaymentMethods $methods): JsonResponse
    {
        $validated = $request->validate([
            'amount_fcfa' => ['required', 'integer', 'min:1'],
            'method' => ['nullable', 'string', Rule::in($methods->accepted())],
            'reason' => ['required', 'string', 'max:2000'],
        ], attributes: ['amount_fcfa' => 'montant', 'method' => 'moyen de remboursement', 'reason' => 'motif']);

        $refund = $this->cashier->refund($payment, (int) $validated['amount_fcfa'], $validated['method'] ?? null, trim((string) $validated['reason']), $this->actor($request));

        return new JsonResponse(['data' => PaymentPresenter::refund($refund)], 201);
    }

    private function reservation(string $uuid): ReservationDue
    {
        return $this->reservations->findByUuid($uuid) ?? throw self::reservationNotFound();
    }

    private static function reservationNotFound(): BusinessRuleException
    {
        return new BusinessRuleException("La réservation demandée n'existe pas.", 'Élément introuvable', 404, 'reservation_not_found');
    }

    private function actor(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user;
    }
}
