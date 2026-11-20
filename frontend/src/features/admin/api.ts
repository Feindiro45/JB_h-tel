import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type {
  CurrentUser,
  Envelope,
  HistoryEntry,
  Paginated,
  RoomType,
} from '../../shared/api/types'

export type Filters = Record<string, string | number | undefined>
export const adminQuery = <T>(path: string, filters: Filters = {}) =>
  queryOptions({
    queryKey: ['admin', path, filters],
    queryFn: ({ signal }) => api.get<T>(`/api/v1/${path}`, { query: filters, signal }),
  })
export interface Rate {
  id: string
  room_type: RoomType
  billing_unit: string
  billing_unit_label: string
  amount_fcfa: number
  previous_amount_fcfa: number | null
  effective_from: string
  effective_to: string | null
  status: string
  status_label: string
  withdrawable: boolean
  reason: string
  created_by: { name: string } | null
}
export interface Setting {
  key: string
  label: string
  value: number | string | boolean | string[] | null
  type: string
  status: string
  reference: string
  editable: boolean
  help: string
  min?: number
  max?: number
  options?: Record<string, string>
  unit?: string | null
  updated_at?: string | null
  updated_by?: string | null
}
export interface Role {
  name: string
  label: string
  permissions: string[]
}
export interface AuditEntry extends HistoryEntry {
  entity: { type: string; type_label: string; id: string | null }
  ip_address: string | null
}
export type AuditList = Paginated<AuditEntry> & { domains: { value: string; label: string }[] }
export type Users = Paginated<CurrentUser>
export type Rates = Envelope<Rate[]>
