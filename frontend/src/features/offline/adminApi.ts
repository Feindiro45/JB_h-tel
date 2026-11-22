import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Envelope, Paginated } from '../../shared/api/types'
import type { OfflineRules } from '../../shared/offline/rules'
import type { StationReport } from '../../shared/offline/stationReport'

/**
 * Module administrateur « Mode hors ligne » (lot 4A) : données du serveur, jamais gardées pour le
 * travail sans réseau (racine `offline`, exclue de la copie du poste).
 */
export interface StationState {
  id: string
  name: string
  is_main: boolean
  silent: boolean
  last_seen_at: string | null
  last_seen_by: string | null
  report: StationReport & { reported_at: string | null }
}

export interface OfflineOverview {
  main: StationState | null
  workstations: StationState[]
  silent_after_minutes: number
  today: { accepted: number; duplicates: number; rejected: number }
  to_review: number
  rules: OfflineRules
}

export type Outcome = 'ACCEPTED' | 'DUPLICATE' | 'REJECTED'
export type Review = 'TO_REVIEW' | 'REENTERED' | 'REJECTED'

export interface OfflineOperationRow {
  id: string
  kind: string
  kind_label: string
  label: string
  user: string | null
  workstation: string | null
  created_offline_at: string | null
  received_at: string
  attempts: number
  outcome: Outcome
  outcome_label: string
  http_status: number
  reason_title: string | null
  reason: string | null
  reason_code: string | null
  review_status: Review | null
  review_label: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_reason: string | null
}

export interface OperationFilters {
  outcome?: Outcome | ''
  review?: Review | ''
  search?: string
  page?: number
  per_page?: number
}

export const OFFLINE_ADMIN_KEY = ['offline', 'admin'] as const

export const offlineOverviewQuery = queryOptions({
  queryKey: [...OFFLINE_ADMIN_KEY, 'overview'],
  queryFn: async ({ signal }) =>
    (await api.get<Envelope<OfflineOverview>>('/api/v1/offline/overview', { signal })).data,
  // Même rythme que le signal de présence des postes.
  refetchInterval: 30_000,
})

export const offlineOperationsQuery = (filters: OperationFilters) =>
  queryOptions({
    queryKey: [...OFFLINE_ADMIN_KEY, 'operations', filters],
    queryFn: ({ signal }) =>
      api.get<Paginated<OfflineOperationRow>>('/api/v1/offline/operations', {
        query: { ...filters },
        signal,
      }),
    placeholderData: (previous) => previous,
  })

export async function reviewOperation(
  id: string,
  input: { resolution: 'REENTERED' | 'REJECTED'; reason: string },
): Promise<OfflineOperationRow> {
  return (
    await api.post<Envelope<OfflineOperationRow>>(`/api/v1/offline/operations/${id}/review`, input)
  ).data
}
