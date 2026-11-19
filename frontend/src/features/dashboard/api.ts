import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Dashboard, Envelope } from '../../shared/api/types'

export const dashboardQuery = queryOptions({
  queryKey: ['dashboard'],
  queryFn: async ({ signal }) =>
    (await api.get<Envelope<Dashboard>>('/api/v1/dashboard', { signal })).data,
  refetchInterval: 60_000,
})
