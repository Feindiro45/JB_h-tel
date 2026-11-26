<?php

namespace App\Modules\Billing\Application;

use App\Modules\Cashier\Contracts\PaymentLine;
use App\Modules\Cashier\Contracts\PaymentStatement;
use App\Modules\Customers\Contracts\CustomerSnapshot;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\ReservationInvoiceData;
use App\Modules\Reservations\Contracts\ReservationInvoiceLine;
use App\Modules\RoomCatalog\Contracts\RoomSnapshot;
use App\Shared\Settings\HotelIdentity;
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
            'room' => $room === null ? null : ['number' => $room->number, 'type' => $room->roomTypeLabel, 'kind' => $room->kind->value],
            // D-072 : salle de conférence ; absent (null) pour une chambre.
            'event' => $reservation->event,
            'stay' => [
                'reservation_uuid' => $reservation->uuid,
                'start_date' => $reservation->startDate,
                'end_date' => $reservation->endDate,
                'start_time' => $reservation->startTime,
                'end_time' => $reservation->endTime,
                'period_is_estimated' => $reservation->periodIsEstimated,
            ],
            'lines' => self::lines($reservation, $room),
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
     * Séjour initial puis une ligne par prolongation (D-053), avec leurs périodes. La somme des
     * montants des lignes est égale au sous-total (brut) de la réservation.
     *
     * @return list<array<string, mixed>>
     */
    private static function lines(ReservationInvoiceData $reservation, ?RoomSnapshot $room): array
    {
        $conference = $room?->isConference() ?? false;
        $base = ($conference ? 'salle ' : 'chambre ').($room->number ?? '?').' ('.($room->roomTypeLabel ?? '').'), '.mb_strtolower($reservation->billingUnitLabel)
            .($conference && $reservation->event !== null ? ' — événement : '.$reservation->event['name'] : '');
        $lines = $reservation->lines !== [] ? $reservation->lines : [new ReservationInvoiceLine(
            ReservationInvoiceLine::STAY, $reservation->startDate, $reservation->startTime, $reservation->endDate,
            $reservation->endTime, $reservation->quantity, $reservation->unitPriceFcfa, $reservation->grossFcfa,
        )];
        $detailed = count($lines) > 1;

        return array_map(fn (ReservationInvoiceLine $line) => [
            'kind' => $line->kind,
            'label' => $line->kind === ReservationInvoiceLine::EXTENSION
                ? 'Prolongation '.self::period($line).' — '.$base
                : ($conference ? 'Location de salle — ' : 'Hébergement — ').$base.($detailed ? ' — '.($conference ? 'réservation initiale ' : 'séjour initial ').self::period($line) : ''),
            'billing_unit' => $reservation->billingUnit,
            'period' => ['from_date' => $line->fromDate, 'from_time' => $line->fromTime, 'to_date' => $line->toDate, 'to_time' => $line->toTime],
            'quantity' => $line->quantity,
            'unit_price_fcfa' => $line->unitPriceFcfa,
            'amount_fcfa' => $line->amountFcfa,
        ], $lines);
    }

    private static function period(ReservationInvoiceLine $line): string
    {
        $day = fn (string $date, ?string $time) => CarbonImmutable::parse($date)->format('d/m/Y').($time !== null ? ' '.str_replace(':', ' h ', $time) : '');

        return 'du '.$day($line->fromDate, $line->fromTime).' au '.$day($line->toDate, $line->toTime);
    }

    /**
     * En-tête de l'hôtel (provisoire, Q-09 et Q-16 : mentions légales et TVA en RCA à confirmer).
     *
     * @return array<string, string|null>
     */
    public static function hotel(): array
    {
        // D-073 : valeurs des Paramètres (à défaut, celles du serveur), figées dans la facture.
        return app(HotelIdentity::class)->toArray();
    }
}
