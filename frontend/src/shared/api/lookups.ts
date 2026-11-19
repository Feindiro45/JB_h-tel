import { queryOptions } from '@tanstack/react-query'
import { api } from './client'
import type { Envelope } from './types'

export const paymentMethodsQuery = queryOptions({
  queryKey: ['payment-methods'],
  queryFn: async ({ signal }) =>
    (
      await api.get<Envelope<{ value: string; label: string }[]>>('/api/v1/payment-methods', {
        signal,
      })
    ).data,
})
export const cashAgentsQuery = queryOptions({
  queryKey: ['cash-agents'],
  queryFn: async ({ signal }) =>
    (await api.get<Envelope<{ id: string; name: string }[]>>('/api/v1/cash-agents', { signal }))
      .data,
})
