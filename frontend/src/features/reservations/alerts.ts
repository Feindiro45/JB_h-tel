import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Envelope, Paginated, Reservation } from '../../shared/api/types'

export interface AlertFilters {
  search?: string
  billing_unit?: string
  page: number
  per_page: number
}
export interface AlertSummary {
  at: string
  total: number
  rooms: number
  day: number
  half_day: number
}
export interface DepartureAlert extends Reservation {
  overdue_minutes: number
}
export const ALERTS_KEY = ['departure-alerts'] as const
export const alertSummaryQuery = queryOptions({
  queryKey: [...ALERTS_KEY, 'summary'],
  queryFn: async ({ signal }) =>
    (await api.get<Envelope<AlertSummary>>('/api/v1/alerts/summary', { signal })).data,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
})
export const departureAlertsQuery = (filters: AlertFilters) =>
  queryOptions({
    queryKey: [...ALERTS_KEY, 'list', filters],
    queryFn: ({ signal }) =>
      api.get<Paginated<DepartureAlert> & { at: string }>('/api/v1/alerts', {
        query: { ...filters },
        signal,
      }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

export function overdueDuration(minutes: number): string {
  if (minutes < 1) return 'À l’instant'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  return [days ? `${days} j` : '', hours ? `${hours} h` : '', rest ? `${rest} min` : '']
    .filter(Boolean)
    .join(' ')
}
