<?php

namespace App\Modules\Notifications\Application;

use App\Modules\Billing\Contracts\InvoiceDocuments;
use App\Modules\Cashier\Contracts\PaymentHistory;
use App\Modules\Reservations\Contracts\ReservationInvoiceData;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Shared\Support\Format;
use Carbon\CarbonImmutable;

/**
 * Compose, en français, le message envoyé au client pour chaque opération sur son séjour (D-039).
 * Toutes les données sont lues par les contrats publics des autres modules.
 */
final class StayMessageFactory
{
    public function __construct(
        private readonly ReservationLedger $reservations,
        private readonly RoomDirectory $rooms,
        private readonly PaymentHistory $payments,
        private readonly InvoiceDocuments $invoices,
    ) {}

    public function confirmed(int $reservationId): ?StayMessage
    {
        return $this->forStay($reservationId, 'reservation.confirmed', 'Votre réservation est confirmée', 'Bienvenue chez '.self::hotel().' !', [
            'Nous avons le plaisir de vous confirmer votre réservation.',
            'Nous serons ravis de vous accueillir.',
        ], withBalance: true);
    }

    public function checkedIn(int $reservationId): ?StayMessage
    {
        return $this->forStay($reservationId, 'reservation.checked_in', 'Bienvenue — votre séjour commence', 'Bienvenue à '.self::hotel().' !', [
            'Votre arrivée a bien été enregistrée. Toute l’équipe vous souhaite un excellent séjour.',
            'N’hésitez pas à vous adresser à la réception pour toute demande.',
        ]);
    }

    public function extended(int $reservationId): ?StayMessage
    {
        return $this->forStay($reservationId, 'reservation.extended', 'Votre séjour est prolongé', 'Prolongation de votre séjour', [
            'La prolongation de votre séjour a été enregistrée. Voici les nouvelles conditions.',
        ], withBalance: true);
    }

    public function cancelled(int $reservationId): ?StayMessage
    {
        return $this->forStay($reservationId, 'reservation.cancelled', 'Votre réservation a été annulée', 'Annulation de votre réservation', [
            'Votre réservation a été annulée.',
            'Si vous avez déjà effectué un versement, notre caisse prendra contact avec vous pour son remboursement.',
        ], withAmount: false);
    }

    public function checkedOut(int $reservationId): ?StayMessage
    {
        return $this->forStay($reservationId, 'reservation.checked_out', 'Merci de votre séjour', 'Merci et à bientôt !', [
            'Votre départ a été enregistré. Merci d’avoir choisi '.self::hotel().' : nous espérons vous revoir très bientôt.',
        ], withBalance: true);
    }

    public function paymentRecorded(int $paymentId): ?StayMessage
    {
        $receipt = $this->payments->receipt($paymentId);
        if ($receipt === null) {
            return null;
        }

        return new StayMessage('payment.recorded', $receipt->reservationId, "Reçu de paiement {$receipt->receiptNumber}", 'Reçu de paiement', [
            'Nous accusons réception de votre paiement. Merci !',
        ], [
            'Reçu' => $receipt->receiptNumber,
            'Montant reçu' => Format::fcfa($receipt->amountFcfa),
            'Moyen de paiement' => $receipt->methodLabel,
            'Date' => Format::dateTime($receipt->at),
        ] + $this->balanceDetails($receipt->reservationId));
    }

    public function paymentRefunded(int $refundId): ?StayMessage
    {
        $refund = $this->payments->refund($refundId);
        if ($refund === null) {
            return null;
        }

        return new StayMessage('payment.refunded', $refund->reservationId, 'Remboursement effectué', 'Remboursement effectué', [
            'Un remboursement a été effectué en votre faveur.',
        ], array_filter([
            'Montant remboursé' => Format::fcfa($refund->amountFcfa),
            'Reçu concerné' => $refund->receiptNumber,
            'Moyen' => $refund->methodLabel,
            'Motif' => (string) $refund->reason,
            'Date' => Format::dateTime($refund->at),
        ], fn (string $value) => $value !== ''));
    }

    public function invoiceIssued(int $invoiceId): ?StayMessage
    {
        $document = $this->invoices->find($invoiceId);
        if ($document === null) {
            return null;
        }

        $lines = $document->isCreditNote
            ? ["Veuillez trouver ci-joint l’avoir {$document->number}, qui annule la facture {$document->creditedNumber}."]
            : ['Veuillez trouver ci-joint votre facture.'];
        $lines[] = 'Vous pouvez vérifier son authenticité à tout moment en scannant le QR code qui y figure.';

        return new StayMessage(
            $document->isCreditNote ? 'invoice.credit_note' : 'invoice.issued',
            $document->reservationId,
            "{$document->typeLabel} {$document->number}",
            "Votre {$document->typeLabel} {$document->number}",
            $lines,
            [
                'Document' => "{$document->typeLabel} n° {$document->number}",
                'Montant net' => Format::fcfa($document->netFcfa),
            ],
            'Vérifier ce document',
            $document->verificationUrl,
            [['name' => "{$document->number}.pdf", 'data' => $document->pdf, 'mime' => 'application/pdf']],
        );
    }

    /**
     * @param  list<string>  $lines
     */
    private function forStay(int $reservationId, string $kind, string $subject, string $title, array $lines, bool $withBalance = false, bool $withAmount = true): ?StayMessage
    {
        $stay = $this->reservations->invoiceData($reservationId);
        if ($stay === null) {
            return null;
        }
        $room = $this->rooms->find($stay->roomId);

        $details = [
            'Chambre' => $room === null ? '—' : "{$room->number} ({$room->roomTypeLabel})",
            'Arrivée' => self::when($stay->startDate, $stay->startTime),
            'Départ' => self::when($stay->endDate, $stay->endTime),
        ];
        if ($withAmount) {
            $details['Formule'] = "{$stay->quantity} × ".mb_strtolower($stay->billingUnitLabel);
            $details['Montant'] = Format::fcfa($stay->netFcfa);
        }
        if ($withBalance) {
            $details += $this->balanceDetails($reservationId, $stay);
        }

        return new StayMessage($kind, $reservationId, $subject, $title, $lines, $details);
    }

    /** @return array<string, string> */
    private function balanceDetails(int $reservationId, ?ReservationInvoiceData $stay = null): array
    {
        $stay ??= $this->reservations->invoiceData($reservationId);
        if ($stay === null || $stay->status === 'CANCELLED') {
            return [];
        }
        $netPaid = $this->payments->forReservation($reservationId)->netPaidFcfa();

        return ['Déjà réglé' => Format::fcfa($netPaid), 'Reste à régler' => Format::fcfa(max(0, $stay->netFcfa - $netPaid))];
    }

    private static function when(string $date, ?string $time): string
    {
        $day = CarbonImmutable::parse($date)->format('d/m/Y');

        return $time === null ? $day : "{$day} à {$time}";
    }

    private static function hotel(): string
    {
        return (string) config('jbhotel.hotel.name', 'JB Hôtel');
    }
}
