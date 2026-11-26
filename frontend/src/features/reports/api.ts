import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Envelope } from '../../shared/api/types'
import { registerOfflineEssential } from '../../shared/offline/essentials'
import { todayIso } from '../../shared/utils/format'

export interface ReportFilters {
  from: string
  to: string
  room_id: string
  room_type_id: string
  agent_id: string
}

/** Filtres par défaut de l'écran : du 1er du mois à aujourd'hui, sans autre filtre. */
export function defaultReportFilters(today = todayIso()): ReportFilters {
  return { from: `${today.slice(0, 8)}01`, to: today, room_id: '', room_type_id: '', agent_id: '' }
}

export const reportQuery = <T>(filters: ReportFilters) =>
  queryOptions({
    queryKey: ['reports', filters],
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<T>>('/api/v1/reports/financial', { query: { ...filters }, signal }))
        .data,
  })

export const reportAgentsQuery = queryOptions({
  queryKey: ['report-agents'],
  queryFn: ({ signal }) =>
    api.get<Envelope<{ id: string; name: string }[]>>('/api/v1/report-agents', { signal }),
})

// Rapport du mois en cours et liste des caissières, consultables hors ligne (lot 4).
registerOfflineEssential('reports.view', () => reportQuery(defaultReportFilters()))
registerOfflineEssential('reports.view', () => reportAgentsQuery)
