import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Dashboard, Envelope } from '../../shared/api/types'
import { registerOfflineEssential } from '../../shared/offline/essentials'

export const dashboardQuery = queryOptions({
  queryKey: ['dashboard'],
  queryFn: async ({ signal }) =>
    (await api.get<Envelope<Dashboard>>('/api/v1/dashboard', { signal })).data,
  refetchInterval: 60_000,
})

// Gardé pour le travail sans réseau (lot 2).
registerOfflineEssential('reports.view', () => dashboardQuery)
