import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
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
    queryFn: ({ signal }) =>
      api.get<Paginated<Customer>>('/api/v1/customers', {
        query: { search, page, per_page: perPage, ...filters },
        signal,
      }),
    placeholderData: (previous) => previous,
  })

export const customerQuery = (id: string) =>
  queryOptions({
    queryKey: customerKeys.detail(id),
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<Customer>>(`/api/v1/customers/${id}`, { signal })).data,
  })

export const customerReservationsQuery = (id: string) =>
  queryOptions({
    queryKey: customerKeys.reservations(id),
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<Reservation[]>>(`/api/v1/customers/${id}/reservations`, { signal }))
        .data,
  })

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  return (await api.post<Envelope<Customer>>('/api/v1/customers', input)).data
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
  return (await api.patch<Envelope<Customer>>(`/api/v1/customers/${id}`, input)).data
}
