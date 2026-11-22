import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { getConnectivity } from '../../shared/offline/connectivity'
import { isLocalId, localQuery } from '../../shared/offline/localRefs'
import { runOrQueue } from '../../shared/offline/offlineWrite'
import { getQueryClientRef } from '../../shared/offline/queryClientRef'
import {
  registerOfflineEssential,
  registerOfflineCoverage,
  registerOfflinePreparation,
} from '../../shared/offline/essentials'
import type { Customer, Envelope, Paginated, Reservation } from '../../shared/api/types'

export interface CustomerInput {
  name: string
  first_name?: string | null
  phone: string
  email?: string | null
  origin_city?: string | null
  origin_country?: string | null
  address?: string | null
  identification_type?: string | null
  identification_number?: string | null
  notes?: string | null
  email_notifications?: boolean
}

export const customerKeys = {
  all: ['customers'] as const,
  list: (search: string, page: number) => ['customers', 'list', search, page] as const,
  detail: (id: string) => ['customers', id] as const,
  reservations: (id: string) => ['customers', id, 'reservations'] as const,
}

export const customersQuery = (
  search: string,
  page = 1,
  perPage = 25,
  filters: Record<string, string> = {},
) =>
  queryOptions({
    queryKey: [...customerKeys.list(search, page), perPage, filters],
    // Hors ligne, la recherche porte sur les clients gardés sur le poste (lot 4, 4.5).
    queryFn: async ({ signal }) => {
      if (!getConnectivity().online) return searchKeptCustomers(search, page, perPage)
      try {
        return await api.get<Paginated<Customer>>('/api/v1/customers', {
          query: { search, page, per_page: perPage, ...filters },
          signal,
        })
      } catch (error) {
        if (error instanceof ApiError && error.isNetworkError) {
          return searchKeptCustomers(search, page, perPage)
        }
        throw error
      }
    },
    networkMode: 'always',
    placeholderData: (previous) => previous,
  })

export const customerQuery = (id: string) =>
  queryOptions({
    queryKey: customerKeys.detail(id),
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<Customer>>(`/api/v1/customers/${id}`, { signal })).data,
    ...(isLocalId(id) ? localQuery<Customer>(customerKeys.detail(id)) : {}),
  })

export const customerReservationsQuery = (id: string) =>
  queryOptions({
    queryKey: customerKeys.reservations(id),
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<Reservation[]>>(`/api/v1/customers/${id}/reservations`, { signal }))
        .data,
    ...(isLocalId(id) ? localQuery<Reservation[]>(customerKeys.reservations(id), []) : {}),
  })

/**
 * Création « comme en ligne » (D-064, lot 4) : hors ligne, la fiche provisoire (`local-…`) est
 * utilisable aussitôt, par exemple pour une réservation ; le serveur la crée à l'envoi, et les
 * opérations qui en dépendent reçoivent son identifiant définitif.
 */
export async function createCustomer(
  input: CustomerInput,
  idempotencyKey?: string,
): Promise<Customer> {
  const fullName = `${input.name.trim()} ${input.first_name?.trim() ?? ''}`.trim()
  return runOrQueue<Customer>({
    kind: 'customer.create',
    label: `Nouveau client — ${fullName}${input.phone ? ` · ${input.phone}` : ''}`,
    path: '/api/v1/customers',
    body: input,
    idempotencyKey,
    provisional: (operation, client) => {
      const customer: Customer = {
        id: operation.localId!,
        name: input.name.trim(),
        first_name: input.first_name?.trim() || null,
        full_name: fullName,
        phone: input.phone || null,
        email: input.email || null,
        email_notifications: input.email_notifications ?? Boolean(input.email),
        origin_city: input.origin_city ?? null,
        origin_country: input.origin_country ?? null,
        address: input.address ?? null,
        identification_type: input.identification_type ?? null,
        identification_number: input.identification_number ?? null,
        notes: input.notes ?? null,
        created_at: new Date(operation.createdAt).toISOString(),
      }
      client.setQueryData(customerKeys.detail(customer.id), customer)
      client.setQueryData(customerKeys.reservations(customer.id), [])
      return customer
    },
  })
}

/** Clients gardés sur le poste : fiches et lignes des listes, sans doublon. */
export function keptCustomers(client: QueryClient | null | undefined): Customer[] {
  const byId = new Map<string, Customer>()
  for (const query of client?.getQueryCache().findAll({ queryKey: customerKeys.all }) ?? []) {
    const data = query.state.data as Customer | Paginated<Customer> | undefined
    if (!data || typeof data !== 'object') continue
    if ('data' in data && Array.isArray(data.data)) {
      for (const item of data.data) if (!byId.has(item.id)) byId.set(item.id, item)
    } else if ('id' in data && query.queryKey.length === 2) {
      byId.set(data.id, data)
    }
  }
  return [...byId.values()]
}

/** Recherche dans les clients gardés sur le poste (nom, prénoms, téléphone, e-mail). */
function searchKeptCustomers(search: string, page: number, perPage: number): Paginated<Customer> {
  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const needle = normalize(search.trim())
  const found = keptCustomers(getQueryClientRef())
    .filter((customer) =>
      normalize(`${customer.full_name} ${customer.phone ?? ''} ${customer.email ?? ''}`).includes(
        needle,
      ),
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'))
  const lastPage = Math.max(1, Math.ceil(found.length / perPage))
  return {
    data: found.slice((page - 1) * perPage, page * perPage),
    meta: { total: found.length, current_page: page, last_page: lastPage },
  }
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
  return (await api.patch<Envelope<Customer>>(`/api/v1/customers/${id}`, input)).data
}

// Liste par défaut de l’écran « Clients », gardée pour le travail sans réseau (lot 2).
registerOfflineEssential('customers.view', () =>
  customersQuery('', 1, 25, { email: '', origin_city: '', origin_country: '' }),
)

// « Tout télécharger » : tout le fichier clients (chaque fiche vient de la liste, même présentation
// côté serveur) et les séjours des clients présents ou attendus.
registerOfflinePreparation({
  order: 40,
  label: 'Clients',
  permission: 'customers.view',
  run: async (context) => {
    for (let page = 1; ; page++) {
      const list = await context.fetch(customersQuery('', page, 100))
      if (!list) break
      for (const customer of list.data) context.seed(customerKeys.detail(customer.id), customer)
      if (page >= list.meta.last_page) break
    }
    await Promise.all(
      context.shared('customers').map((id) => context.fetch(customerReservationsQuery(id))),
    )
  },
})

// Comparaison « sur ce poste / en ligne » de la page Synchronisation.
registerOfflineCoverage({
  order: 20,
  label: 'Clients',
  permission: 'customers.view',
  match: (key) => key[0] === 'customers' && (key[1] === 'list' || key.length === 2),
  serverTotal: async () =>
    (await api.get<Paginated<unknown>>('/api/v1/customers', { query: { per_page: 10 } })).meta
      .total,
})
