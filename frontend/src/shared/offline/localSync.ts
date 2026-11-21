import type { QueryClient } from '@tanstack/react-query'
import { toUserError } from '../api/errors'
import { newIdempotencyKey } from '../api/idempotency'
import { getConnectivity } from './connectivity'
import { offlineEssentials } from './essentials'
import { isKept, saveQueryCache, type StoredCache } from './persistence'
import {
  appendRun,
  statusOf,
  writeAutoSave,
  type SyncFailure,
  type SyncRun,
  type SyncTrigger,
} from './syncLog'

/** Nom lisible d'un jeu de données, d'après la racine de sa clé de requête. */
const LABELS: Record<string, string> = {
  auth: 'Session',
  catalog: 'Chambres et catégories',
  reservations: 'Réservations',
  occupancy: 'Occupation des chambres',
  planning: 'Planning',
  availability: 'Disponibilités',
  customers: 'Clients',
  payments: 'Encaissements et reçus',
  'cash-journal': 'Journal de caisse',
  'cash-agents': 'Caissières',
  invoices: 'Factures et avoirs',
  dashboard: 'Tableau de bord',
  alerts: 'Alertes',
  'departure-alerts': 'Alertes de départ',
  receivables: 'Créances',
  rooms: 'Chambres',
  'room-types': 'Catégories de chambres',
  rates: 'Tarifs',
  reports: 'Rapports',
  workstation: 'Poste de caisse',
  'payment-methods': 'Moyens de paiement',
}

export function datasetLabel(queryKey: readonly unknown[]): string {
  const root = String(queryKey[0])
  return LABELS[root] ?? root
}

/** Éléments d'une réponse : lignes d'une liste, sinon une fiche. */
export function countRecords(data: unknown): number {
  if (data === null || data === undefined) return 0
  if (Array.isArray(data)) return data.length
  if (typeof data === 'object') {
    const inner = (data as { data?: unknown }).data
    if (Array.isArray(inner)) return inner.length
  }
  return 1
}

export interface LocalDataset {
  label: string
  records: number
  updatedAt: number
}

/** Contenu de la copie locale, regroupé par jeu de données (écran « Synchronisation »). */
export function describeLocalCopy(client: QueryClient): LocalDataset[] {
  const groups = new Map<string, LocalDataset>()
  for (const query of client.getQueryCache().getAll()) {
    if (query.state.status !== 'success' || !isKept(query.queryKey)) continue
    const label = datasetLabel(query.queryKey)
    const current = groups.get(label) ?? { label, records: 0, updatedAt: 0 }
    current.records += countRecords(query.state.data)
    current.updatedAt = Math.max(current.updatedAt, query.state.dataUpdatedAt)
    groups.set(label, current)
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

export function sizeOf(cache: StoredCache | null): number | null {
  return cache ? new Blob([JSON.stringify(cache)]).size : null
}

let syncing = false

/** Pendant une mise à jour, les échecs vont au journal, pas dans des fenêtres d'erreur. */
export function isSyncing(): boolean {
  return syncing
}

const OFFLINE_CAUSE =
  'Connexion impossible : le serveur n’est pas joignable. Réessayez au retour du réseau.'

/**
 * « Mettre à jour en local » : recharge depuis le serveur chaque jeu de données gardé sur le
 * poste, enregistre la copie et ajoute une ligne au journal (succès, partiel ou échec et causes).
 */
export async function updateLocalCopy(
  client: QueryClient,
  trigger: SyncTrigger,
  user: string | null,
): Promise<SyncRun> {
  const startedAt = Date.now()
  const failures: SyncFailure[] = []
  let succeeded = 0
  let records = 0
  let skipped = 0
  let bytes: number | null = null

  if (!getConnectivity().online) {
    failures.push({ dataset: 'Serveur', cause: OFFLINE_CAUSE })
  } else {
    syncing = true
    try {
      const kept = client
        .getQueryCache()
        .getAll()
        .filter((query) => isKept(query.queryKey) && query.state.data !== undefined)
      // Une donnée restaurée de la copie, dont l’écran n’a pas été rouvert, n’a pas de fonction
      // de chargement : elle reste telle quelle et sera rechargée à l’ouverture de l’écran.
      const queries = kept.filter((query) => typeof query.options.queryFn === 'function')
      const refreshed = new Set(queries.map((query) => query.queryHash))
      // Écrans essentiels téléchargés même s’ils n’ont jamais été ouverts sur ce poste.
      const me = client.getQueryData<{ permissions?: string[] } | null>(['auth', 'me'])
      const essentials = offlineEssentials(me?.permissions ?? []).filter(
        (options) => !refreshed.has(client.getQueryCache().build(client, options).queryHash),
      )
      const restored = new Set(
        essentials.map((options) => client.getQueryCache().build(client, options).queryHash),
      )
      skipped = kept.filter(
        (query) => !refreshed.has(query.queryHash) && !restored.has(query.queryHash),
      ).length
      const tasks: { key: readonly unknown[]; run: () => Promise<unknown> }[] = [
        ...queries.map((query) => ({
          key: query.queryKey,
          run: () =>
            client
              .refetchQueries({ queryKey: query.queryKey, exact: true }, { throwOnError: true })
              .then(() => query.state.data),
        })),
        ...essentials.map((options) => ({
          key: options.queryKey,
          run: () => client.fetchQuery({ ...options, staleTime: 0 }),
        })),
      ]
      const results = await Promise.allSettled(tasks.map((task) => task.run()))
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          succeeded++
          records += countRecords(result.value)
          return
        }
        const dataset = datasetLabel(tasks[index]!.key)
        const cause = toUserError(result.reason).message
        if (!failures.some((f) => f.dataset === dataset && f.cause === cause)) {
          failures.push({ dataset, cause })
        }
      })
    } finally {
      syncing = false
    }
    try {
      bytes = sizeOf(await saveQueryCache(client))
    } catch (error) {
      failures.push({
        dataset: 'Copie locale',
        cause: error instanceof Error ? error.message : 'Enregistrement impossible sur ce poste.',
      })
    }
  }

  const run: SyncRun = {
    id: newIdempotencyKey(),
    direction: 'local',
    trigger,
    startedAt,
    finishedAt: Date.now(),
    status: statusOf(succeeded, failures.length),
    datasets: succeeded,
    records,
    skipped,
    bytes,
    failures,
    user,
  }
  await appendRun(run)
  return run
}

/** Copie automatique (après chaque lecture réussie) : seul son dernier état est gardé. */
export async function recordAutoSave(
  client: QueryClient,
  cache: StoredCache | null,
  error?: unknown,
): Promise<void> {
  const datasets = describeLocalCopy(client)
  await writeAutoSave({
    at: Date.now(),
    status: error ? 'failure' : 'success',
    datasets: datasets.length,
    records: datasets.reduce((sum, d) => sum + d.records, 0),
    bytes: sizeOf(cache),
    cause: error ? (error instanceof Error ? error.message : String(error)) : null,
  })
}
