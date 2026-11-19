<?php

namespace App\Modules\Billing\Application;

use App\Modules\Cashier\Contracts\PaymentLine;
use App\Modules\Cashier\Contracts\PaymentStatement;
use App\Modules\Customers\Contracts\CustomerSnapshot;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\ReservationInvoiceData;
use App\Modules\RoomCatalog\Contracts\RoomSnapshot;
use Carbon\CarbonImmutable;

/**
 * Instantané **figé** d'une facture : tout ce qui est imprimé est copié au moment de l'émission
 * (en-tête de l'hôtel, client, chambre, période, prix, remise, versements, solde, émetteur).
 * Une modification ultérieure des tarifs, du client ou des paiements ne change donc jamais une
 * facture émise.
 */
final class InvoiceSnapshotBuilder
{
    /** @return array<string, mixed> */
    public function build(
        string $number,
        CarbonImmutable $issuedAt,
        User $issuer,
        ReservationInvoiceData $reservation,
        ?CustomerSnapshot $customer,
        ?RoomSnapshot $room,
        PaymentStatement $payments,
    ): array {
        return [
            'document' => ['type' => 'INVOICE', 'label' => 'Facture', 'number' => $number, 'issued_at' => $issuedAt->toIso8601String()],
            'hotel' => self::hotel(),
            'customer' => $customer === null ? null : [
                'full_name' => $customer->fullName,
                'phone' => $customer->phone,
                'email' => $customer->email,
                'address' => $customer->address,
            ],
            'room' => $room === null ? null : ['number' => $room->number, 'type' => $room->roomTypeLabel],
            'stay' => [
                'reservation_uuid' => $reservation->uuid,
                'start_date' => $reservation->startDate,
                'end_date' => $reservation->endDate,
                'start_time' => $reservation->startTime,
                'end_time' => $reservation->endTime,
                'period_is_estimated' => $reservation->periodIsEstimated,
            ],
            'lines' => [[
                'label' => 'Hébergement — chambre '.($room->number ?? '?').' ('.($room->roomTypeLabel ?? '').'), '.mb_strtolower($reservation->billingUnitLabel),
                'billing_unit' => $reservation->billingUnit,
                'quantity' => $reservation->quantity,
                'unit_price_fcfa' => $reservation->unitPriceFcfa,
                'amount_fcfa' => $reservation->grossFcfa,
            ]],
            'totals' => [
                'gross_fcfa' => $reservation->grossFcfa,
                'discount_label' => $reservation->discountLabel,
                'discount_reason' => $reservation->discountReason,
                'discount_fcfa' => $reservation->discountFcfa,
                'net_fcfa' => $reservation->netFcfa,
            ],
            'payments' => [
                'lines' => array_map(fn (PaymentLine $line) => [
                    'receipt_number' => $line->receiptNumber,
                    'received_at' => $line->receivedAt->toIso8601String(),
                    'method' => $line->methodLabel,
                    'amount_fcfa' => $line->amountFcfa,
                    'refunded_fcfa' => $line->refundedFcfa,
                ], $payments->lines),
                'paid_fcfa' => $payments->paidFcfa,
                'refunded_fcfa' => $payments->refundedFcfa,
                'net_paid_fcfa' => $payments->netPaidFcfa(),
                'balance_fcfa' => $reservation->netFcfa - $payments->netPaidFcfa(),
            ],
            'issued_by' => ['name' => $issuer->name],
        ];
    }

    /**
     * En-tête de l'hôtel (provisoire, Q-09 et Q-16 : mentions légales et TVA en RCA à confirmer).
     *
     * @return array<string, string|null>
     */
    public static function hotel(): array
    {
        /** @var array<string, string|null> $hotel */
        $hotel = (array) config('jbhotel.hotel');

        return $hotel;
    }
}
