<?php

namespace App\Modules\Billing\Application\Services;

use App\Modules\Billing\Application\InvoiceSnapshotBuilder;
use App\Modules\Billing\Application\InvoiceVerification;
use App\Modules\Billing\Domain\InvoiceStatus;
use App\Modules\Billing\Domain\InvoiceType;
use App\Modules\Billing\Events\InvoiceIssued;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Cashier\Contracts\PaymentHistory;
use App\Modules\Customers\Contracts\CustomerDirectory;
use App\Modules\Identity\Models\User;
use App\Modules\Reservations\Contracts\ReservationDue;
use App\Modules\Reservations\Contracts\ReservationLedger;
use App\Modules\RoomCatalog\Contracts\RoomDirectory;
use App\Shared\Contracts\AuditTrail;
use App\Shared\Exceptions\BusinessRuleException;
use App\Shared\Numbering\DocumentNumberer;
use App\Shared\Settings\SettingsRepository;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Facturation (cahier des charges, « Facturation ») : numéro unique, montants brut, remise, net,
 * versements et solde, données **figées** à l'émission. Toute correction passe par un avoir
 * (document rectificatif), sous réserve des règles fiscales de la RCA (Q-09, provisoire).
 */
final class InvoiceService
{
    public function __construct(
        private readonly ReservationLedger $reservations,
        private readonly CustomerDirectory $customers,
        private readonly RoomDirectory $rooms,
        private readonly PaymentHistory $payments,
        private readonly InvoiceSnapshotBuilder $snapshots,
        private readonly DocumentNumberer $numbers,
        private readonly SettingsRepository $settings,
        private readonly AuditTrail $audit,
    ) {}

    /** Une seule facture active (émise, non créditée) par réservation. */
    /**
     * @param  array{invoice_number: string, reason: string}|null  $replaces  Facture remplacée (D-053), mentionnée sur la nouvelle.
     */
    public function issue(ReservationDue $reservation, User $actor, ?array $replaces = null): Invoice
    {
        return DB::transaction(function () use ($reservation, $actor, $replaces): Invoice {
            $due = $this->reservations->lockForPayment($reservation->id) ?? throw self::reservationNotFound();

            if ($due->cancelled || $due->status === 'PENDING') {
                throw new BusinessRuleException(
                    "Impossible d'émettre une facture : la réservation est « {$due->statusLabel} ».",
                    'Facturation impossible',
                    409,
                    'reservation_not_billable',
                );
            }

            $active = Invoice::query()
                ->where('reservation_id', $due->id)
                ->where('type', InvoiceType::Invoice->value)
                ->where('status', InvoiceStatus::Issued->value)
                ->first();
            if ($active !== null) {
                throw new BusinessRuleException(
                    "La facture {$active->invoice_number} est déjà émise pour cette réservation. Pour la corriger, émettez un avoir puis une nouvelle facture.",
                    'Facture déjà émise',
                    409,
                    'invoice_already_issued',
                );
            }

            $data = $this->reservations->invoiceData($due->id) ?? throw self::reservationNotFound();
            $issuedAt = CarbonImmutable::now();
            $number = $this->numbers->next($this->settings->string('billing.invoice_number_prefix', 'FAC'), $issuedAt);
            $snapshot = $this->snapshots->build(
                $number,
                $issuedAt,
                $actor,
                $data,
                $this->customers->find($data->customerId),
                $this->rooms->find($data->roomId),
                $this->payments->forReservation($data->id),
            );
            if ($replaces !== null) {
                $snapshot['replaces'] = $replaces;
            }

            $invoice = Invoice::query()->create([
                'reservation_id' => $due->id,
                'type' => InvoiceType::Invoice,
                'invoice_number' => $number,
                'verification_code' => InvoiceVerification::newCode(),
                'issued_at' => $issuedAt,
                'issued_by' => $actor->id,
                'gross_fcfa' => $data->grossFcfa,
                'discount_fcfa' => $data->discountFcfa,
                'net_fcfa' => $data->netFcfa,
                'snapshot_json' => $snapshot,
                'status' => InvoiceStatus::Issued,
            ]);

            $this->audit->record('invoice.issued', 'invoice', $invoice->id, after: [
                'invoice_number' => $number,
                'reservation_uuid' => $due->uuid,
                'net_fcfa' => $data->netFcfa,
            ], actorId: $actor->id);
            event(new InvoiceIssued($invoice->id));

            return $invoice;
        });
    }

    /**
     * Avoir total sur une facture émise (document rectificatif). La facture d'origine reste
     * intacte ; elle est seulement marquée « annulée par avoir ». Une nouvelle facture peut ensuite
     * être émise, par exemple après une prolongation.
     */
    public function credit(Invoice $invoice, string $reason, User $actor): Invoice
    {
        return DB::transaction(function () use ($invoice, $reason, $actor): Invoice {
            $this->reservations->lockForPayment($invoice->reservation_id) ?? throw self::reservationNotFound();
            /** @var Invoice $invoice */
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);

            if ($invoice->type !== InvoiceType::Invoice || $invoice->status !== InvoiceStatus::Issued) {
                throw new BusinessRuleException(
                    'Seule une facture émise et non encore créditée peut faire l’objet d’un avoir.',
                    'Avoir impossible',
                    409,
                    'invoice_not_creditable',
                );
            }

            $issuedAt = CarbonImmutable::now();
            $number = $this->numbers->next($this->settings->string('billing.credit_note_prefix', 'AV'), $issuedAt);
            $snapshot = array_merge($invoice->snapshot_json, [
                'document' => ['type' => 'CREDIT_NOTE', 'label' => 'Avoir', 'number' => $number, 'issued_at' => $issuedAt->toIso8601String()],
                'credit' => [
                    'credited_invoice_number' => $invoice->invoice_number,
                    'credited_invoice_issued_at' => $invoice->issued_at->toIso8601String(),
                    'reason' => $reason,
                ],
                'issued_by' => ['name' => $actor->name],
            ]);

            $creditNote = Invoice::query()->create([
                'reservation_id' => $invoice->reservation_id,
                'type' => InvoiceType::CreditNote,
                'credited_invoice_id' => $invoice->id,
                'invoice_number' => $number,
                'verification_code' => InvoiceVerification::newCode(),
                'issued_at' => $issuedAt,
                'issued_by' => $actor->id,
                'gross_fcfa' => $invoice->gross_fcfa,
                'discount_fcfa' => $invoice->discount_fcfa,
                'net_fcfa' => $invoice->net_fcfa,
                'snapshot_json' => $snapshot,
                'status' => InvoiceStatus::Issued,
            ]);

            $invoice->status = InvoiceStatus::Credited;
            $invoice->save();
            event(new InvoiceIssued($creditNote->id));

            $this->audit->record('invoice.credited', 'invoice', $invoice->id, ['status' => InvoiceStatus::Issued->value], [
                'status' => InvoiceStatus::Credited->value,
                'credit_note_number' => $number,
                'reason' => $reason,
            ], $actor->id);

            return $creditNote;
        });
    }

    private static function reservationNotFound(): BusinessRuleException
    {
        return new BusinessRuleException("La réservation n'existe pas.", 'Élément introuvable', 404, 'reservation_not_found');
    }
}
