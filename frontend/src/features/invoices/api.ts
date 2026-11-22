import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { isLocalId, localQuery } from '../../shared/offline/localRefs'
import { runOrQueue } from '../../shared/offline/offlineWrite'
import { getQueryClientRef } from '../../shared/offline/queryClientRef'
import { assertInvoiceable, PROVISIONAL_INVOICE_PREFIX, provisionalInvoice } from './offlineInvoice'
import {
  registerOfflineEssential,
  registerOfflineCoverage,
  registerOfflinePreparation,
} from '../../shared/offline/essentials'
import type {
  Envelope,
  InvoiceDetail,
  InvoiceRow,
  InvoiceSummary,
  InvoiceTotals,
  Paginated,
  Reservation,
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
    ...(isLocalId(reservationId)
      ? localQuery<InvoiceSummary[]>(invoicesKey(reservationId), [])
      : {}),
  })

function keptStay(client: QueryClient, reservationId: string): Reservation {
  const stay = client.getQueryData<Reservation>(['reservations', reservationId])
  if (!stay) {
    throw new ApiError(
      409,
      'Réservation absente de ce poste',
      'Cette réservation n’est pas gardée sur ce poste : ouvrez sa fiche en ligne, ou faites « Tout télécharger pour le hors ligne ».',
      {},
      'offline_data_missing',
    )
  }
  return stay
}

/**
 * Émission « comme en ligne » (lot 4, 4.13) : hors ligne, facture provisoire `FAC-LOC-…`
 * imprimable en ticket 80 mm ; le serveur l'émet avec son numéro FAC définitif à l'envoi.
 */
export async function issueInvoice(reservationId: string): Promise<InvoiceSummary> {
  return runOrQueue<InvoiceSummary>({
    kind: 'invoice.issue',
    label: `Facture — ${describeReservation(reservationId)}`,
    path: `/api/v1/reservations/${reservationId}/invoices`,
    body: undefined,
    numbered: true,
    numberPrefix: PROVISIONAL_INVOICE_PREFIX,
    validate: (client) =>
      assertInvoiceable(
        keptStay(client, reservationId),
        client.getQueryData<InvoiceSummary[]>(invoicesKey(reservationId)) ?? [],
      ),
    provisional: (operation, client) => {
      const invoice = provisionalInvoice(client, keptStay(client, reservationId), operation)
      client.setQueryData(['invoices', 'detail', invoice.id], invoice)
      const { snapshot: _snapshot, ...summary } = invoice
      client.setQueryData<InvoiceSummary[]>(invoicesKey(reservationId), (old) => [
        summary,
        ...(old ?? []),
      ])
      return summary
    },
  })
}

/** « chambre 101 · NGUEMA Paul », d'après la fiche gardée sur le poste. */
function describeReservation(reservationId: string): string {
  const stay = getQueryClientRef()?.getQueryData<Reservation>(['reservations', reservationId])
  if (!stay) return 'réservation'
  return [stay.room && `chambre ${stay.room.number}`, stay.customer?.full_name]
    .filter(Boolean)
    .join(' · ')
}

/** Facture ou avoir avec son instantané figé (`snapshot_json`), base du ticket 80 mm (D-061). */
export const invoiceQuery = (invoiceId: string) =>
  queryOptions({
    queryKey: ['invoices', 'detail', invoiceId],
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<InvoiceDetail>>(`/api/v1/invoices/${invoiceId}`, { signal })).data,
    ...(isLocalId(invoiceId) ? localQuery<InvoiceDetail>(['invoices', 'detail', invoiceId]) : {}),
  })

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

// « Tout télécharger » : factures et avoirs de chaque séjour gardé, réimprimables en ticket.
registerOfflinePreparation({
  order: 30,
  label: 'Factures et avoirs',
  permission: 'invoices.view',
  run: async (context) => {
    await Promise.all(
      context.shared('reservations').map(async (reservationId) => {
        const documents = await context.fetch(reservationInvoicesQuery(reservationId))
        await Promise.all(
          (documents ?? []).map((document) => context.fetch(invoiceQuery(document.id))),
        )
      }),
    )
  },
})

// Comparaison « sur ce poste / en ligne » de la page Synchronisation.
registerOfflineCoverage({
  order: 40,
  label: 'Factures et avoirs',
  permission: 'invoices.view',
  match: (key) => key[0] === 'invoices',
  serverTotal: async () =>
    (await api.get<Paginated<unknown>>('/api/v1/invoices', { query: { per_page: 10 } })).meta.total,
})
