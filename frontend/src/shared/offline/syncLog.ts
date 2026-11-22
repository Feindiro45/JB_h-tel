import { storageDelete, storageGet, storageSet } from './storage'

/**
 * Journal des synchronisations du poste (menu « Synchronisation et sauvegardes ») : chaque
 * mise à jour, réussie ou non, avec ses chiffres et la cause de chaque échec. Gardé sur le
 * poste ; les envois vers le serveur (lot 4) s'y ajouteront avec `direction: 'online'`.
 */
export type SyncDirection = 'local' | 'online'
export type SyncTrigger = 'manual' | 'reconnect' | 'auto' | 'full'
export type SyncStatus = 'success' | 'partial' | 'failure'

export interface SyncFailure {
  /** Jeu de données concerné (« Réservations », « Copie locale »…). */
  dataset: string
  /** Cause lisible, en français. */
  cause: string
}

export interface SyncRun {
  id: string
  direction: SyncDirection
  trigger: SyncTrigger
  startedAt: number
  finishedAt: number
  status: SyncStatus
  /** Jeux de données traités (écrans, listes, fiches). */
  datasets: number
  /** Éléments contenus (lignes de listes, fiches). */
  records: number
  /** Jeux gardés sans rechargement : écran pas encore rouvert depuis le démarrage. */
  skipped: number
  /** Taille de la copie locale enregistrée (octets), si connue. */
  bytes: number | null
  failures: SyncFailure[]
  user: string | null
}

const RUNS_KEY = 'sync-runs'
const AUTO_KEY = 'sync-auto-save'
export const MAX_RUNS = 50

/** Dernière copie automatique (après chaque lecture réussie), sans encombrer l'historique. */
export interface AutoSave {
  at: number
  status: 'success' | 'failure'
  datasets: number
  records: number
  bytes: number | null
  cause: string | null
}

export async function readRuns(): Promise<SyncRun[]> {
  return (await storageGet<SyncRun[]>(RUNS_KEY)) ?? []
}

export async function appendRun(run: SyncRun): Promise<SyncRun[]> {
  const runs = [run, ...(await readRuns())].slice(0, MAX_RUNS)
  await storageSet(RUNS_KEY, runs)
  return runs
}

export function readAutoSave(): Promise<AutoSave | undefined> {
  return storageGet<AutoSave>(AUTO_KEY)
}

export async function writeAutoSave(save: AutoSave): Promise<void> {
  await storageSet(AUTO_KEY, save)
}

export async function clearSyncLog(): Promise<void> {
  await storageDelete(RUNS_KEY)
  await storageDelete(AUTO_KEY)
}

export function statusOf(succeeded: number, failed: number): SyncStatus {
  if (failed === 0) return 'success'
  return succeeded === 0 ? 'failure' : 'partial'
}
