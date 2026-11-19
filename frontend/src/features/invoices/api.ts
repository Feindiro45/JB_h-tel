import { queryOptions } from '@tanstack/react-query'
import { api, apiUrl } from '../../shared/api/client'
import type { Envelope, InvoiceSummary } from '../../shared/api/types'

export const invoicesKey = (reservationId: string) => ['invoices', reservationId] as const

export const reservationInvoicesQuery = (reservationId: string) =>
  queryOptions({
    queryKey: invoicesKey(reservationId),
    queryFn: async ({ signal }) =>
      (
        await api.get<Envelope<InvoiceSummary[]>>(
          `/api/v1/reservations/${reservationId}/invoices`,
          { signal },
        )
      ).data,
  })

export async function issueInvoice(reservationId: string): Promise<InvoiceSummary> {
  return (
    await api.post<Envelope<InvoiceSummary>>(`/api/v1/reservations/${reservationId}/invoices`)
  ).data
}

/** PDF A4 généré par le serveur (source de vérité), ouvert dans un nouvel onglet. */
export function invoicePdfUrl(invoiceId: string): string {
  return apiUrl(`/api/v1/invoices/${invoiceId}/pdf`)
}
