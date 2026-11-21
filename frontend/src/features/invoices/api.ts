import { queryOptions } from '@tanstack/react-query'
import { api, apiUrl } from '../../shared/api/client'
import { registerOfflineEssential } from '../../shared/offline/essentials'
import type {
  Envelope,
  InvoiceDetail,
  InvoiceRow,
  InvoiceSummary,
  InvoiceTotals,
  Paginated,
} from '../../shared/api/types'

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

/** Facture ou avoir avec son instantané figé (`snapshot_json`), base du ticket 80 mm (D-061). */
export const invoiceQuery = (invoiceId: string) =>
  queryOptions({
    queryKey: ['invoices', 'detail', invoiceId],
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<InvoiceDetail>>(`/api/v1/invoices/${invoiceId}`, { signal })).data,
  })

/** PDF A4 généré par le serveur (source de vérité), ouvert dans un nouvel onglet. */
export function invoicePdfUrl(invoiceId: string): string {
  return apiUrl(`/api/v1/invoices/${invoiceId}/pdf`)
}

export interface InvoiceFilters {
  type?: string
  status?: string
  from?: string
  to?: string
  search?: string
  per_page?: number
  page?: number
}

export const invoicesListQuery = (filters: InvoiceFilters) =>
  queryOptions({
    queryKey: ['invoices', 'list', filters],
    queryFn: ({ signal }) =>
      api.get<Paginated<InvoiceRow> & { totals: InvoiceTotals }>('/api/v1/invoices', {
        query: { ...filters },
        signal,
      }),
    placeholderData: (previous) => previous,
  })

/** Avoir motivé : la facture d'origine reste figée et passe « annulée par avoir ». */
export async function creditInvoice(invoiceId: string, reason: string): Promise<InvoiceSummary> {
  return (
    await api.post<Envelope<InvoiceSummary>>(`/api/v1/invoices/${invoiceId}/credit-notes`, {
      reason,
    })
  ).data
}

// Liste par défaut de l’écran « Factures et reçus », gardée pour le travail sans réseau (lot 2).
registerOfflineEssential('invoices.view', () => invoicesListQuery({ page: 1, per_page: 25 }))
