import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import type { Envelope } from '../../shared/api/types'
import { readWorkstationToken, saveWorkstationToken } from '../../shared/api/workstationToken'
import type { OfflineRules } from '../../shared/offline/rules'
import { stationReport } from '../../shared/offline/stationReport'

/** État du poste courant, renvoyé à l'enregistrement et à chaque signal de présence. */
export interface WorkstationSelf {
  id: string
  name: string
  is_main: boolean
  revoked: boolean
  main: { name: string; silent: boolean } | null
  enforce_main_post: boolean
  /** Règles hors ligne (lot 4A.5), gardées sur le poste. */
  offline_rules?: OfflineRules
}

export interface WorkstationRow {
  id: string
  name: string
  user_agent: string | null
  registered_at: string
  registered_by: string | null
  last_seen_at: string | null
  last_seen_by: string | null
  silent: boolean
  revoked_at: string | null
  revocation_reason: string | null
  is_main: boolean
  is_current: boolean
}

export interface WorkstationAssignmentRow {
  id: string
  number: number
  mode: 'FIRST' | 'PLANNED' | 'FORCED'
  mode_label: string
  workstation: string | null
  previous_workstation: string | null
  reason: string | null
  previous_last_seen_at: string | null
  assigned_by: string | null
  assigned_at: string
}

export interface WorkstationsOverview {
  main: {
    id: string
    name: string
    last_seen_at: string | null
    silent: boolean
    assignment_number: number
    assigned_at: string
    assigned_by: string | null
  } | null
  settings: { enforce_main_post: boolean; silent_after_minutes: number }
  workstations: WorkstationRow[]
  assignments: WorkstationAssignmentRow[]
}

export const WORKSTATION_SELF_KEY = ['workstation', 'self'] as const
export const WORKSTATIONS_KEY = ['workstations'] as const

async function register(): Promise<WorkstationSelf> {
  const response = await api.post<Envelope<WorkstationSelf> & { token: string }>(
    '/api/v1/workstations/register',
  )
  saveWorkstationToken(response.token)
  return response.data
}

/**
 * Enregistre ce navigateur au premier passage, puis signale sa présence. Un jeton inconnu du
 * serveur (base réinitialisée) est remplacé par un nouvel enregistrement.
 */
export async function announceWorkstation(): Promise<WorkstationSelf> {
  if (!readWorkstationToken()) return register()
  try {
    const report = await stationReport().catch(() => null)
    return (
      await api.post<Envelope<WorkstationSelf>>(
        '/api/v1/workstations/heartbeat',
        report ? { report } : undefined,
      )
    ).data
  } catch (error) {
    if (error instanceof ApiError && error.code === 'workstation_unknown') {
      saveWorkstationToken(null)
      return register()
    }
    throw error
  }
}

export const workstationsQuery = () =>
  queryOptions({
    queryKey: WORKSTATIONS_KEY,
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<WorkstationsOverview>>('/api/v1/workstations', { signal })).data,
  })

export async function renameWorkstation(id: string, name: string) {
  return (await api.patch<Envelope<WorkstationsOverview>>(`/api/v1/workstations/${id}`, { name }))
    .data
}

export async function designateWorkstation(id: string, body: { reason?: string; force?: boolean }) {
  return (
    await api.post<Envelope<WorkstationsOverview>>(`/api/v1/workstations/${id}/designate`, body)
  ).data
}

export async function revokeWorkstation(id: string, reason: string) {
  return (
    await api.post<Envelope<WorkstationsOverview>>(`/api/v1/workstations/${id}/revoke`, { reason })
  ).data
}

export async function reactivateWorkstation(id: string) {
  return (await api.post<Envelope<WorkstationsOverview>>(`/api/v1/workstations/${id}/reactivate`))
    .data
}

/** Règle D-062, réglée par l'écran Paramètres (journalisée côté serveur). */
export async function setMainPostEnforcement(value: boolean) {
  return api.put(`/api/v1/settings/workstations.enforce_main_post`, { value })
}
