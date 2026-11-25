import type { QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { api } from '../api/client'
import { toUserError } from '../api/errors'
import { storageGet, storageSet } from './storage'

/**
 * Changements faits ailleurs (autre poste, interface web, administrateur) : lus dans le journal
 * du serveur avec un curseur (D-069, `GET /sync/changes`), pour actualiser seulement les écrans
 * concernés, sans rechargement manuel. Lancé à chaque synchronisation (démarrage, retour du
 * réseau, toutes les 30 s, réveil du poste). Un serveur sans ce journal (version antérieure)
 * est simplement ignoré : les écrans se rechargent comme avant.
 */
const CURSOR_KEY = 'server-changes'
const MAX_PAGES = 20

interface StoredCursor {
  userId: string
  cursor: string
}

interface ChangeRow {
  entity: string
  id: string | null
  action: 'created' | 'updated' | 'deleted'
  occurred_at: string
}

interface ChangePage {
  data: ChangeRow[]
  meta: { cursor: string; has_more: boolean; protocol: number }
}

interface SyncStatus {
  data: { protocol: number; server_time: string; cursor: string; poll_seconds: number }
}

/** Écrans (débuts de clés de requête) à actualiser pour chaque type de donnée changé. */
const SCREENS: Record<string, readonly (readonly string[])[]> = {
  customer: [['customers'], ['reservations']],
  room: [['catalog'], ['occupancy'], ['planning'], ['free-rooms'], ['admin']],
  room_type: [['catalog'], ['occupancy'], ['planning'], ['free-rooms'], ['admin']],
  room_rate: [['rates'], ['admin']],
  reservation: [
    ['reservations'],
    ['planning'],
    ['occupancy'],
    ['free-rooms'],
    ['departure-alerts'],
    ['dashboard'],
    ['receivables'],
    ['customers'],
    ['reports'],
  ],
  payment: [
    ['payments'],
    ['cash-journal'],
    ['receivables'],
    ['dashboard'],
    ['reservations'],
    ['invoices'],
    ['reports'],
  ],
  invoice: [['invoices'], ['reservations'], ['dashboard'], ['reports']],
  user: [['admin'], ['auth', 'me'], ['cash-agents'], ['report-agents']],
  workstation: [['admin'], ['offline', 'admin']],
  setting: [['admin']],
  role: [['auth', 'me'], ['admin']],
}
SCREENS.reservation_extension = SCREENS.reservation!
SCREENS.reservation_occupant = SCREENS.reservation!
SCREENS.refund = SCREENS.payment!

export interface ServerChangesState {
  /** `false` : serveur sans journal des changements (version antérieure). */
  supported: boolean
  checkedAt: number | null
  /** Changements reçus au dernier passage. */
  lastCount: number
  /** Total depuis l'ouverture de l'application. */
  received: number
}

let state: ServerChangesState = { supported: true, checkedAt: null, lastCount: 0, received: 0 }
const listeners = new Set<() => void>()
let pulling = false
/** Identifiants des fiches changées au dernier passage (mise à jour automatique du poste). */
let changedIds = new Set<string>()

/** Rend puis oublie les fiches changées signalées par le serveur depuis le dernier appel. */
export function takeChangedIds(): string[] {
  const ids = [...changedIds]
  changedIds = new Set()
  return ids
}

function emit(next: Partial<ServerChangesState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function useServerChanges(): ServerChangesState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

/** Écrans touchés par une liste de types de données (tous si un type est inconnu). */
export function screensFor(entities: Iterable<string>): (readonly string[])[] | 'all' {
  const roots = new Map<string, readonly string[]>()
  for (const entity of entities) {
    const screens = SCREENS[entity]
    if (!screens) return 'all'
    for (const root of screens) roots.set(JSON.stringify(root), root)
  }
  return [...roots.values()]
}

async function saveCursor(userId: string, cursor: string): Promise<void> {
  await storageSet(CURSOR_KEY, { userId, cursor } satisfies StoredCursor)
}

async function freshCursor(userId: string): Promise<void> {
  const status = await api.get<SyncStatus>('/api/v1/sync/status')
  await saveCursor(userId, status.data.cursor)
}

/**
 * Lit les changements après le curseur du poste et actualise les écrans concernés. Rend le
 * nombre de changements reçus, ou `null` (déjà en cours, serveur sans journal).
 */
export async function pullServerChanges(
  client: QueryClient,
  user: { id: string },
): Promise<number | null> {
  if (pulling || !state.supported) return null
  pulling = true
  try {
    const stored = await storageGet<StoredCursor>(CURSOR_KEY)
    const start = stored?.userId === user.id ? stored.cursor : null
    if (!start) {
      // Premier passage : les données viennent d'être chargées ; le suivi commence maintenant.
      await freshCursor(user.id)
      emit({ checkedAt: Date.now(), lastCount: 0 })
      return 0
    }
    let cursor: string = start
    const entities = new Set<string>()
    let count = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const result: ChangePage = await api.get<ChangePage>('/api/v1/sync/changes', {
        query: { cursor, limit: 200 },
      })
      for (const row of result.data) {
        entities.add(row.entity)
        // Au plus 500 fiches retenues : au-delà, la mise à jour complète suivante les reprend.
        if (row.id && changedIds.size < 500) changedIds.add(row.id)
      }
      count += result.data.length
      cursor = result.meta.cursor
      if (!result.meta.has_more) break
    }
    await saveCursor(user.id, cursor)
    const screens = screensFor(entities)
    if (screens === 'all') await client.invalidateQueries()
    else await Promise.all(screens.map((queryKey) => client.invalidateQueries({ queryKey })))
    emit({ checkedAt: Date.now(), lastCount: count, received: state.received + count })
    return count
  } catch (error) {
    const failure = toUserError(error)
    if (failure.status === 404) {
      emit({ supported: false })
      return null
    }
    // Curseur trop ancien ou illisible : tous les écrans sont rechargés, le suivi repart.
    if (failure.status === 410 || failure.status === 422) {
      await client.invalidateQueries()
      await freshCursor(user.id).catch(() => undefined)
      emit({ checkedAt: Date.now(), lastCount: 0 })
      return 0
    }
    throw error
  } finally {
    pulling = false
  }
}

/** Tests uniquement. */
export function resetServerChangesForTests(): void {
  state = { supported: true, checkedAt: null, lastCount: 0, received: 0 }
  pulling = false
  changedIds = new Set()
}
