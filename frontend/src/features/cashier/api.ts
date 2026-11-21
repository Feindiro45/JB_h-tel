import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { registerOfflineEssential } from '../../shared/offline/essentials'
import { todayIso } from '../../shared/utils/format'
import type {
  AccountSummary,
  CashJournal,
  Envelope,
  Paginated,
  Payment,
  PaymentRow,
  Receipt,
  Receivable,
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
  })

export async function recordPayment(
  reservationId: string,
  input: { amount_fcfa: number; method: string; reference?: string | null },
  idempotencyKey?: string,
): Promise<Payment> {
  return (
    await api.post<Envelope<Payment>>(`/api/v1/reservations/${reservationId}/payments`, input, {
      idempotencyKey,
    })
  ).data
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
