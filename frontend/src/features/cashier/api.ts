import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import {
  registerOfflineEssential,
  registerOfflineCoverage,
  registerOfflinePreparation,
} from '../../shared/offline/essentials'
import { isLocalId, localQuery } from '../../shared/offline/localRefs'
import { runOrQueue } from '../../shared/offline/offlineWrite'
import { getQueryClientRef } from '../../shared/offline/queryClientRef'
import { formatFcfa, todayIso } from '../../shared/utils/format'
import { provisionalPayment } from './offlinePayment'
import type {
  AccountSummary,
  CashJournal,
  Envelope,
  Paginated,
  Payment,
  PaymentRow,
  Receipt,
  Receivable,
  Reservation,
  RefundDue,
} from '../../shared/api/types'

export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'CASH', label: 'Espèces' },
  { value: 'MOBILE_MONEY', label: 'Mobile money' },
  { value: 'CARD', label: 'Carte bancaire' },
  { value: 'BANK_TRANSFER', label: 'Virement' },
]

export const paymentsKey = (reservationId: string) => ['payments', reservationId] as const

export const reservationPaymentsQuery = (reservationId: string) =>
  queryOptions({
    queryKey: paymentsKey(reservationId),
    queryFn: ({ signal }) =>
      api.get<{ data: Payment[]; summary: AccountSummary }>(
        `/api/v1/reservations/${reservationId}/payments`,
        { signal },
      ),
    ...(isLocalId(reservationId)
      ? localQuery<{ data: Payment[]; summary: AccountSummary }>(paymentsKey(reservationId))
      : {}),
  })

/** « chambre 101 · NGUEMA Paul », d'après la fiche gardée sur le poste. */
function describeReservation(reservationId: string): string {
  const stay = getQueryClientRef()?.getQueryData<Reservation>(['reservations', reservationId])
  if (!stay) return 'réservation'
  return [stay.room && `chambre ${stay.room.number}`, stay.customer?.full_name]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Encaissement « comme en ligne » (D-064) : envoyé au serveur s'il répond, sinon gardé sur le
 * poste avec un reçu provisoire `LOC-…` et envoyé au retour du réseau (lot 4).
 */
export async function recordPayment(
  reservationId: string,
  input: { amount_fcfa: number; method: string; reference?: string | null },
  idempotencyKey?: string,
): Promise<Payment> {
  const path = `/api/v1/reservations/${reservationId}/payments`
  return runOrQueue({
    kind: 'payment.record',
    label: `Encaissement de ${formatFcfa(input.amount_fcfa)} — ${describeReservation(reservationId)}`,
    path,
    body: input,
    idempotencyKey,
    numbered: true,
    provisional: (operation, client) => provisionalPayment(client, reservationId, input, operation),
  })
}

export interface PaymentFilters {
  agent_id?: string
  from?: string
  to?: string
  method?: string
  status?: string
  search?: string
  per_page?: number
  page?: number
}

/** Clés de cache des écrans de caisse : à invalider après tout mouvement. */
export const CASH_KEYS = [['payments'], ['cash-journal'], ['receivables'], ['dashboard']] as const

export const cashJournalQuery = (from: string, to: string, agentId: string) =>
  queryOptions({
    queryKey: ['cash-journal', from, to, agentId],
    queryFn: async ({ signal }) =>
      (
        await api.get<Envelope<CashJournal>>('/api/v1/cash-journal', {
          query: { from, to, agent_id: agentId },
          signal,
        })
      ).data,
    placeholderData: (previous) => previous,
  })

export const paymentsListQuery = (filters: PaymentFilters) =>
  queryOptions({
    queryKey: ['payments', 'list', filters],
    queryFn: ({ signal }) =>
      api.get<Paginated<PaymentRow>>('/api/v1/payments', { query: { ...filters }, signal }),
    placeholderData: (previous) => previous,
  })

export const receivablesQuery = queryOptions({
  queryKey: ['receivables'],
  queryFn: ({ signal }) =>
    api.get<{
      data: Receivable[]
      total_fcfa: number
      to_refund: RefundDue[]
      to_refund_total_fcfa: number
    }>('/api/v1/receivables', { signal }),
})

export const receiptQuery = (paymentId: string) =>
  queryOptions({
    queryKey: ['payments', 'receipt', paymentId],
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<Receipt>>(`/api/v1/payments/${paymentId}`, { signal })).data,
    ...(isLocalId(paymentId) ? localQuery<Receipt>(['payments', 'receipt', paymentId]) : {}),
  })

/** Annulation motivée d'un encaissement (jamais de suppression). */
export async function cancelPayment(
  paymentId: string,
  reason: string,
  idempotencyKey?: string,
): Promise<Payment> {
  return (
    await api.post<Envelope<Payment>>(
      `/api/v1/payments/${paymentId}/cancel`,
      { reason },
      { idempotencyKey },
    )
  ).data
}

/** Remboursement : ligne distincte, le versement d'origine reste intact. */
export async function refundPayment(
  paymentId: string,
  input: { amount_fcfa: number; method?: string | null; reason: string },
  idempotencyKey?: string,
): Promise<void> {
  await api.post(`/api/v1/payments/${paymentId}/refunds`, input, { idempotencyKey })
}

// Journal de caisse du jour, gardé pour le travail sans réseau (lot 2).
registerOfflineEssential('payments.view', () => cashJournalQuery(todayIso(), todayIso(), ''))
// Soldes à encaisser (page Caisse) et liste des reçus (Factures et reçus → Reçus), filtres par défaut.
registerOfflineEssential('payments.view', () => receivablesQuery)
registerOfflineEssential('payments.view', () => paymentsListQuery({ page: 1, per_page: 25 }))

registerOfflinePreparation({
  order: 20,
  label: 'Encaissements et reçus',
  permission: 'payments.view',
  run: async (context) => {
    await Promise.all(
      context.shared('reservations').map(async (reservationId) => {
        const payments = await context.fetch(reservationPaymentsQuery(reservationId))
        await Promise.all(
          (payments?.data ?? []).map((payment) => context.fetch(receiptQuery(payment.id))),
        )
      }),
    )
  },
})

// Comparaison « sur ce poste / en ligne » de la page Synchronisation.
registerOfflineCoverage({
  order: 30,
  label: 'Encaissements',
  permission: 'payments.view',
  match: (key) => key[0] === 'payments',
  serverTotal: async () =>
    (await api.get<Paginated<unknown>>('/api/v1/payments', { query: { per_page: 10 } })).meta.total,
})
