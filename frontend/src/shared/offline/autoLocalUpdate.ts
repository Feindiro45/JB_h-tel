import type { QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { isDesktop } from '../desktop/bridge'
import { getConnectivity } from './connectivity'
import { getInstallState } from './install'
import { isSyncing, updateLocalCopy, type DownloadProgress } from './localSync'
import { readOutbox } from './outbox'
import { takeChangedIds } from './serverChanges'
import { readRuns, type SyncRun } from './syncLog'
import { SYNC_LOG_KEY } from './syncQueries'

/**
 * Mise à jour automatique de la copie locale (D-070, demande de l'utilisateur du 23/11/2026 :
 * « que le logiciel se mette à jour tout seul, les caissières peuvent oublier »). Sur le
 * logiciel Windows et la PWA installée, sans aucun clic :
 * - téléchargement complet (« Tout télécharger ») au démarrage et au retour d'Internet s'il date
 *   de plus de 3 h, puis toutes les 3 h ;
 * - écrans gardés et essentiels toutes les 15 min, et au plus 2 min après un changement signalé
 *   par le serveur (autre poste, site web) ; les fiches changées sont relues tout de suite ;
 * - jamais hors ligne, ni tant qu'une opération faite hors ligne attend l'envoi (ses reçus et
 *   factures provisoires ne sont jamais écrasés par la copie du serveur) ;
 * - en arrière-plan, au rythme de 40 requêtes par minute (la caissière garde la priorité sur la
 *   limite du serveur), sans fenêtre d'erreur : chaque passage est noté dans l'historique.
 * Intervalles provisoires, à ajuster avec l'hôtel.
 */
export const AUTO_LOCAL_UPDATE = {
  fullEveryMs: 3 * 3600_000,
  essentialsEveryMs: 15 * 60_000,
  afterChangesMs: 2 * 60_000,
  perMinute: 40,
} as const

export type AutoUpdateKind = 'full' | 'essentials'

export interface AutoUpdateState {
  running: AutoUpdateKind | null
  progress: DownloadProgress | null
  lastFullAt: number | null
  lastLocalAt: number | null
}

const IDLE: AutoUpdateState = { running: null, progress: null, lastFullAt: null, lastLocalAt: null }
let state: AutoUpdateState = IDLE
const listeners = new Set<() => void>()
/** Changements du serveur reçus depuis la dernière mise à jour des écrans. */
let changesWaiting = false

function emit(next: Partial<AutoUpdateState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function useAutoLocalUpdate(): AutoUpdateState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

/** Logiciel Windows, ou PWA installée sur le poste (fenêtre d'application). */
export function autoLocalUpdateEnabled(): boolean {
  return isDesktop() || getInstallState().installed
}

const succeeded = (run: SyncRun) => run.direction === 'local' && run.status !== 'failure'

/** Dernières mises à jour réussies (même partielles), d'après l'historique gardé sur le poste. */
export function lastUpdates(runs: SyncRun[]): { full: number | null; local: number | null } {
  const ok = runs.filter(succeeded)
  const full = ok.find((run) => run.trigger === 'full' || run.trigger === 'auto-full')
  return { full: full?.startedAt ?? null, local: ok[0]?.startedAt ?? null }
}

/** Ce qu'il faut faire maintenant : rien, les écrans essentiels, ou tout le poste. */
export function nextAutoUpdate(
  last: { full: number | null; local: number | null },
  changes: boolean,
  now: number,
): AutoUpdateKind | null {
  if (last.full === null || now - last.full >= AUTO_LOCAL_UPDATE.fullEveryMs) return 'full'
  const since = last.local === null ? Infinity : now - last.local
  if (since >= AUTO_LOCAL_UPDATE.essentialsEveryMs) return 'essentials'
  if (changes && since >= AUTO_LOCAL_UPDATE.afterChangesMs) return 'essentials'
  return null
}

/** Relit tout de suite les fiches changées sur le serveur, même quand leur écran est fermé. */
async function refreshChangedRecords(client: QueryClient): Promise<void> {
  const ids = new Set(takeChangedIds())
  if (ids.size === 0) return
  await client
    .refetchQueries({
      type: 'all',
      predicate: (query) =>
        typeof query.options.queryFn === 'function' &&
        query.queryKey.some((part) => typeof part === 'string' && ids.has(part)),
    })
    .catch(() => undefined)
}

/**
 * Appelée à chaque synchronisation (démarrage, retour d'Internet, toutes les 30 s, réveil du
 * poste), avec le nombre de changements reçus du serveur. Ne fait rien si ce n'est pas le
 * moment ; rend le genre de mise à jour lancée.
 */
export async function runAutoLocalUpdate(
  client: QueryClient,
  user: { id: string; name: string },
  options: { changes?: number | null; now?: number } = {},
): Promise<AutoUpdateKind | null> {
  if (options.changes) changesWaiting = true
  if (!autoLocalUpdateEnabled() || !getConnectivity().online || isSyncing()) return null
  const waiting = (await readOutbox()).some(
    (operation) => operation.status === 'pending' && operation.userId === user.id,
  )
  if (waiting) return null
  await refreshChangedRecords(client)
  const last = lastUpdates(await readRuns())
  emit({ lastFullAt: last.full, lastLocalAt: last.local })
  const kind = nextAutoUpdate(last, changesWaiting, options.now ?? Date.now())
  if (!kind || isSyncing()) return null
  changesWaiting = false
  emit({ running: kind, progress: null })
  try {
    const run = await updateLocalCopy(client, kind === 'full' ? 'auto-full' : 'auto', user.name, {
      full: kind === 'full',
      perMinute: AUTO_LOCAL_UPDATE.perMinute,
      collapseHistory: true,
      onProgress: (progress) => emit({ progress }),
    })
    const done = lastUpdates([run])
    emit({
      lastFullAt: done.full ?? state.lastFullAt,
      lastLocalAt: done.local ?? state.lastLocalAt,
    })
  } finally {
    emit({ running: null, progress: null })
    void client.invalidateQueries({ queryKey: SYNC_LOG_KEY })
  }
  return kind
}

/** Tests uniquement. */
export function resetAutoLocalUpdateForTests(): void {
  state = IDLE
  changesWaiting = false
}
