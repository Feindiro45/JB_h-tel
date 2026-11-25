import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../shared/api/errors'
import type {
  AccountSummary,
  CurrentUser,
  Customer,
  InvoiceDetail,
  InvoiceSnapshot,
  InvoiceSummary,
  Payment,
  Receipt,
  Reservation,
} from '../../shared/api/types'
import type { QueuedOperation } from '../../shared/offline/outbox'

/**
 * Facture émise hors ligne (lot 4, 4.13, décision de l'utilisateur du 22/11/2026) : comme les
 * reçus (N-03), une facture provisoire `FAC-LOC-…` est imprimable en ticket 80 mm ; au retour du
 * réseau, le serveur l'émet avec son numéro FAC définitif et son instantané figé, à réimprimer.
 * Validation fiscale par l'hôtel attendue (Q-09, Q-16).
 */
export const PROVISIONAL_INVOICE_PREFIX = 'FAC-'

/** Document associé à l'opération de création/confirmation : aucun second envoi n'est nécessaire. */
export function cacheAutomaticInvoice(
  client: QueryClient,
  stay: Reservation,
  operation: QueuedOperation,
): void {
  if (stay.status !== 'CONFIRMED') return
  const invoice = provisionalInvoice(client, stay, {
    ...operation,
    localId: `local-auto-${operation.id}`,
  })
  client.setQueryData(['invoices', 'detail', invoice.id], invoice)
  const { snapshot: _snapshot, ...summary } = invoice
  client.setQueryData<InvoiceSummary[]>(['invoices', stay.id], (old) => [
    summary,
    ...(old ?? []).filter((item) => item.status !== 'ISSUED' || item.type !== 'INVOICE'),
  ])
}

export function isProvisionalInvoice(number: string): boolean {
  return number.startsWith(`${PROVISIONAL_INVOICE_PREFIX}LOC-`)
}

/** En-tête de l'hôtel repris d'un document déjà gardé sur le poste (facture ou reçu). */
function keptHotel(client: QueryClient): Record<string, string | null> {
  for (const query of client.getQueryCache().findAll({ queryKey: ['invoices', 'detail'] })) {
    const hotel = (query.state.data as InvoiceDetail | undefined)?.snapshot?.hotel
    if (hotel) return hotel
  }
  for (const query of client.getQueryCache().findAll({ queryKey: ['payments', 'receipt'] })) {
    const hotel = (query.state.data as Receipt | undefined)?.hotel
    if (hotel) return hotel
  }
  return { name: 'JB Hôtel' }
}

function keptCustomer(client: QueryClient, id: string | undefined): Customer | undefined {
  if (!id) return undefined
  const detail = client.getQueryData<Customer>(['customers', id])
  if (detail) return detail
  for (const query of client.getQueryCache().findAll({ queryKey: ['customers', 'list'] })) {
    const found = (query.state.data as { data?: Customer[] } | undefined)?.data?.find(
      (customer) => customer.id === id,
    )
    if (found) return found
  }
  return undefined
}

/** Remise affichée comme le serveur (`Discount::describe`) : « 10 % », « 5 000 FCFA ». */
function discountLabel(discount: Reservation['price']['discount']): string | null {
  if (!discount) return null
  const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
  if (discount.type === 'FIXED') return `${number.format(Number(discount.value))} FCFA`
  return `${number.format(Number(discount.value))} %`
}

/** Une facture active existe déjà : le serveur refuserait une deuxième émission. */
export function assertInvoiceable(stay: Reservation, invoices: InvoiceSummary[]): void {
  if (['PENDING', 'CANCELLED'].includes(stay.status)) {
    throw new ApiError(
      409,
      'Facture impossible',
      `La réservation est « ${stay.status_label} » : seule une réservation confirmée, en cours ou terminée peut être facturée.`,
      {},
      'invalid_status',
    )
  }
  if (invoices.some((invoice) => invoice.type === 'INVOICE' && invoice.status === 'ISSUED')) {
    throw new ApiError(
      409,
      'Déjà facturée',
      'Cette réservation a déjà une facture active : pour la corriger, émettez un avoir en ligne.',
      {},
      'already_invoiced',
    )
  }
}

/** Facture provisoire construite comme l'instantané du serveur (`InvoiceSnapshotBuilder`). */
export function provisionalInvoice(
  client: QueryClient,
  stay: Reservation,
  operation: QueuedOperation,
): InvoiceDetail {
  const number = operation.provisionalNumber ?? `${PROVISIONAL_INVOICE_PREFIX}LOC`
  const issuedAt = new Date(operation.createdAt).toISOString()
  const customer = keptCustomer(client, stay.customer?.id)
  const user = client.getQueryData<CurrentUser | null>(['auth', 'me'])
  const account = client.getQueryData<{ data: Payment[]; summary: AccountSummary }>([
    'payments',
    stay.id,
  ])
  const valid = (account?.data ?? []).filter((payment) => payment.status === 'VALID')
  const paid = valid.reduce((sum, payment) => sum + payment.amount_fcfa, 0)
  const refunded = valid.reduce((sum, payment) => sum + payment.refunded_fcfa, 0)
  const roomLabel = stay.room
    ? `chambre ${stay.room.number} (${stay.room.room_type.label}), ${stay.price.billing_unit_label.toLowerCase()}`
    : 'chambre ?'
  const snapshot: InvoiceSnapshot = {
    document: { type: 'INVOICE', label: 'Facture provisoire', number, issued_at: issuedAt },
    hotel: keptHotel(client),
    customer: customer
      ? {
          full_name: customer.full_name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
        }
      : stay.customer
        ? {
            full_name: stay.customer.full_name,
            phone: stay.customer.phone,
            email: null,
            address: null,
          }
        : null,
    room: stay.room ? { number: stay.room.number, type: stay.room.room_type.label } : null,
    stay: {
      reservation_uuid: stay.id,
      start_date: stay.period.start_date,
      end_date: stay.period.end_date,
      start_time: stay.period.start_time,
      end_time: stay.period.end_time,
      period_is_estimated: stay.period.is_estimated,
    },
    lines: [
      {
        kind: 'STAY',
        label: `Hébergement — ${roomLabel}`,
        billing_unit: stay.price.billing_unit,
        quantity: stay.price.quantity,
        unit_price_fcfa: stay.price.unit_price_fcfa,
        amount_fcfa: stay.price.gross_fcfa,
      },
    ],
    totals: {
      gross_fcfa: stay.price.gross_fcfa,
      discount_label: discountLabel(stay.price.discount),
      discount_reason: stay.price.discount?.reason ?? null,
      discount_fcfa: stay.price.discount_fcfa,
      net_fcfa: stay.price.net_fcfa,
    },
    payments: {
      lines: valid.map((payment) => ({
        receipt_number: payment.receipt_number,
        received_at: payment.received_at,
        method: payment.method_label,
        amount_fcfa: payment.amount_fcfa,
        refunded_fcfa: payment.refunded_fcfa,
      })),
      paid_fcfa: paid,
      refunded_fcfa: refunded,
      net_paid_fcfa: paid - refunded,
      balance_fcfa: stay.price.net_fcfa - (paid - refunded),
    },
    issued_by: user ? { name: user.name } : null,
  }
  return {
    id: operation.localId!,
    type: 'INVOICE',
    type_label: 'Facture',
    number,
    issued_at: issuedAt,
    status: 'ISSUED',
    status_label: 'Provisoire — en attente d’envoi',
    credited_invoice: null,
    gross_fcfa: stay.price.gross_fcfa,
    discount_fcfa: stay.price.discount_fcfa,
    net_fcfa: stay.price.net_fcfa,
    verification_url: '',
    snapshot,
  }
}
