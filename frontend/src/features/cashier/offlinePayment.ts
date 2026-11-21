import type { QueryClient } from '@tanstack/react-query'
import type {
  AccountSummary,
  CurrentUser,
  Payment,
  Receipt,
  Reservation,
} from '../../shared/api/types'
import type { QueuedOperation } from '../../shared/offline/outbox'

export const PENDING_LABEL = 'En attente d’envoi'

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile money',
  CARD: 'Carte bancaire',
  BANK_TRANSFER: 'Virement',
}

/** Situation du séjour après un versement fait sur le poste (même règle que le serveur). */
export function summaryAfterPayment(summary: AccountSummary, amount: number): AccountSummary {
  const netPaid = summary.net_paid_fcfa + amount
  const balance = summary.amount_due_fcfa - netPaid
  const status: AccountSummary['status'] =
    balance < 0 ? 'TO_REFUND' : balance === 0 ? 'PAID' : 'PARTIALLY_PAID'
  const labels: Record<AccountSummary['status'], string> = {
    TO_REFUND: 'À rembourser',
    NOTHING_DUE: 'Rien à payer',
    UNPAID: 'Non payé',
    PARTIALLY_PAID: 'Partiellement payé',
    PAID: 'Soldé',
  }
  return {
    ...summary,
    paid_fcfa: summary.paid_fcfa + amount,
    net_paid_fcfa: netPaid,
    balance_fcfa: balance,
    status,
    status_label: labels[status],
  }
}

/**
 * Encaissement fait hors ligne (lot 4) : la ligne provisoire `LOC-…` apparaît aussitôt sur la
 * fiche, le solde est recalculé sur le poste et le reçu (A4 et ticket 80 mm) est imprimable.
 * Au retour du réseau, le serveur l'enregistre et donne le numéro définitif.
 */
export function provisionalPayment(
  client: QueryClient,
  reservationId: string,
  input: { amount_fcfa: number; method: string; reference?: string | null },
  operation: QueuedOperation,
): Payment {
  const user = client.getQueryData<CurrentUser | null>(['auth', 'me'])
  const methods = client.getQueryData<{ value: string; label: string }[]>(['payment-methods'])
  const payment: Payment = {
    id: operation.localId!,
    receipt_number: operation.provisionalNumber ?? 'LOC',
    amount_fcfa: input.amount_fcfa,
    refunded_fcfa: 0,
    method: input.method,
    method_label:
      methods?.find((m) => m.value === input.method)?.label ??
      METHOD_LABELS[input.method] ??
      input.method,
    reference: input.reference ?? null,
    received_at: new Date(operation.createdAt).toISOString(),
    cashier: { id: user?.id ?? '', name: user?.name ?? operation.userName },
    status: 'VALID',
    status_label: PENDING_LABEL,
    cancelled_at: null,
    cancellation_reason: null,
    refunds: [],
  }

  let summary: AccountSummary | null = null
  client.setQueryData<{ data: Payment[]; summary: AccountSummary }>(
    ['payments', reservationId],
    (old) => {
      if (!old) return old
      summary = summaryAfterPayment(old.summary, input.amount_fcfa)
      return { data: [payment, ...old.data], summary }
    },
  )

  const reservation = client.getQueryData<Reservation>(['reservations', reservationId])
  const hotel = client
    .getQueryCache()
    .findAll({ queryKey: ['payments', 'receipt'] })
    .map((query) => (query.state.data as Receipt | undefined)?.hotel)
    .find(Boolean) ?? { name: 'JB Hôtel' }
  const due = reservation?.price.amount_due_fcfa ?? 0
  const receipt: Receipt = {
    ...payment,
    reservation: { id: reservationId, status_label: reservation?.status_label ?? '' },
    stay: reservation
      ? {
          start_date: reservation.period.start_date,
          start_time: reservation.period.start_time,
          end_date: reservation.period.end_date,
          end_time: reservation.period.end_time,
          billing_unit_label: reservation.price.billing_unit_label,
          quantity: reservation.price.quantity,
        }
      : null,
    customer: reservation?.customer
      ? { id: reservation.customer.id, full_name: reservation.customer.full_name }
      : null,
    room: reservation?.room
      ? {
          id: reservation.room.id,
          number: reservation.room.number,
          room_type: reservation.room.room_type.label,
        }
      : null,
    summary:
      summary ??
      summaryAfterPayment(
        {
          amount_due_fcfa: due,
          paid_fcfa: 0,
          refunded_fcfa: 0,
          net_paid_fcfa: 0,
          balance_fcfa: due,
          status: 'UNPAID',
          status_label: 'Non payé',
        },
        input.amount_fcfa,
      ),
    summary_at: new Date(operation.createdAt).toISOString(),
    hotel,
  }
  client.setQueryData(['payments', 'receipt', payment.id], receipt)
  return payment
}
