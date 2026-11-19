import { queryOptions } from '@tanstack/react-query'
import { api } from '../../../shared/api/client'

/** Contrat de `GET /api/v1/health` (backend : HealthController). */
export interface HealthStatus {
  status: 'ok' | 'degraded'
  application: string
  api_version: string
  database: 'ok' | 'indisponible'
  server_time: string
}

export const healthQueryOptions = queryOptions({
  queryKey: ['system', 'health'],
  queryFn: ({ signal }) => api.get<HealthStatus>('/api/v1/health', { signal }),
  staleTime: 0,
})
