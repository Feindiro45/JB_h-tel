import type { QueryClient } from '@tanstack/react-query'
import { ApiError, toUserError } from '../api/errors'
import { newIdempotencyKey } from '../api/idempotency'
import { getConnectivity } from './connectivity'
import { offlineEssentials, offlinePreparations, type PreparationContext } from './essentials'
import { createLimiter, RETRY_AFTER_429_MS, sleep } from './pacing'
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

export interface DownloadProgress {
  /** Données à télécharger connues à cet instant (le total grandit au fil des étapes). */
  planned: number
  done: number
  failed: number
  step: string
}

export interface DownloadOptions {
  /** Téléchargement complet : fiches de détail en plus des écrans gardés et essentiels. */
  full?: boolean
  onProgress?: (progress: DownloadProgress) => void
  /** Requêtes par minute au plus : le serveur en accepte 120 par utilisateur (marge gardée). */
  perMinute?: number
  concurrency?: number
  /** Attente avant de réessayer après un « trop de requêtes » (429). */
  retryDelayMs?: number
}

/**
 * « Mettre à jour en local » : recharge depuis le serveur chaque jeu de données gardé sur le
 * poste et les écrans essentiels ; avec `full`, télécharge aussi les fiches de détail déclarées
 * par chaque feature (« Tout télécharger pour le hors ligne »). La copie est enregistrée, et une
 * ligne ajoutée au journal (succès, partiel ou échec et causes).
 */
export async function updateLocalCopy(
  client: QueryClient,
  trigger: SyncTrigger,
  user: string | null,
  options: DownloadOptions = {},
): Promise<SyncRun> {
  const startedAt = Date.now()
  const failures: SyncFailure[] = []
  let succeeded = 0
  let records = 0
  let skipped = 0
  let bytes: number | null = null
  const progress: DownloadProgress = { planned: 0, done: 0, failed: 0, step: 'Écrans gardés' }
  const report = () => options.onProgress?.({ ...progress })
  const fail = (dataset: string, cause: string) => {
    if (!failures.some((f) => f.dataset === dataset && f.cause === cause)) {
      failures.push({ dataset, cause })
    }
  }
  const limit = createLimiter(options.perMinute, options.concurrency)
  const retryDelay = options.retryDelayMs ?? RETRY_AFTER_429_MS

  /** Une donnée : rythme limité, reprise après un 429, cause gardée en cas d'échec. */
  async function download<T>(
    key: readonly unknown[],
    load: () => Promise<T>,
  ): Promise<T | undefined> {
    progress.planned++
    report()
    for (let attempt = 0; ; attempt++) {
      if (!getConnectivity().online) {
        progress.failed++
        fail(datasetLabel(key), OFFLINE_CAUSE)
        report()
        return undefined
      }
      try {
        const data = await limit(load)
        succeeded++
        records += countRecords(data)
        progress.done++
        report()
        return data
      } catch (error) {
        if (error instanceof ApiError && error.status === 429 && attempt < 3) {
          await sleep(retryDelay)
          continue
        }
        progress.failed++
        fail(datasetLabel(key), toUserError(error).message)
        report()
        return undefined
      }
    }
  }

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
      const permissions = me?.permissions ?? []
      const essentials = offlineEssentials(permissions).filter(
        (essential) => !refreshed.has(client.getQueryCache().build(client, essential).queryHash),
      )
      const restored = new Set(
        essentials.map((essential) => client.getQueryCache().build(client, essential).queryHash),
      )
      skipped = kept.filter(
        (query) => !refreshed.has(query.queryHash) && !restored.has(query.queryHash),
      ).length
      await Promise.all([
        ...queries.map((query) =>
          download(query.queryKey, () =>
            client
              .refetchQueries({ queryKey: query.queryKey, exact: true }, { throwOnError: true })
              .then(() => query.state.data),
          ),
        ),
        ...essentials.map((essential) =>
          download(essential.queryKey, () =>
            client.fetchQuery({ ...essential, staleTime: 0, retry: false }),
          ),
        ),
      ])

      if (options.full) {
        const shared = new Map<string, string[]>()
        const context: PreparationContext = {
          can: (permission) => permissions.includes(permission),
          fetch: (query) =>
            download(query.queryKey, () =>
              client.fetchQuery({ ...query, staleTime: 0, retry: false }),
            ),
          seed: (queryKey, data) => client.setQueryData(queryKey, data),
          share: (key, values) =>
            shared.set(key, [...new Set([...(shared.get(key) ?? []), ...values])]),
          shared: (key) => shared.get(key) ?? [],
        }
        for (const preparation of offlinePreparations(permissions)) {
          progress.step = preparation.label
          report()
          try {
            await preparation.run(context)
          } catch (error) {
            fail(preparation.label, toUserError(error).message)
          }
        }
      }
    } finally {
      syncing = false
    }
    progress.step = 'Enregistrement sur le poste'
    report()
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
