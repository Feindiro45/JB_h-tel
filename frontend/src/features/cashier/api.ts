import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { AccountSummary, Envelope, Payment } from '../../shared/api/types'

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
): Promise<Payment> {
  return (
    await api.post<Envelope<Payment>>(`/api/v1/reservations/${reservationId}/payments`, input)
  ).data
}
