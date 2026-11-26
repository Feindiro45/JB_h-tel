import { readLastBackup } from './backup'
import { readOutbox } from './outbox'
import { storageProtection } from './storage'
import { readRuns } from './syncLog'

/**
 * État hors ligne du poste, envoyé au serveur avec chaque signal de présence (lot 4A) : il permet à
 * l'administrateur de suivre le poste principal depuis un autre appareil (« Mode hors ligne »).
 * Seuls des compteurs et des dates partent : jamais le contenu des opérations.
 */
export interface StationReport {
  pending_operations: number
  rejected_operations: number
  oldest_pending_at: string | null
  last_sync_at: string | null
  last_sync_status: 'success' | 'partial' | 'failure' | null
  last_backup_at: string | null
  storage_persisted: boolean | null
}

export async function stationReport(): Promise<StationReport> {
  const [operations, runs, backup, protection] = await Promise.all([
    readOutbox(),
    readRuns(),
    readLastBackup(),
    storageProtection(),
  ])
  const pending = operations.filter((operation) => operation.status === 'pending')
  const oldest = pending.reduce<number | null>(
    (min, operation) => (min === null || operation.createdAt < min ? operation.createdAt : min),
    null,
  )
  const last = runs[0]
  return {
    pending_operations: pending.length,
    rejected_operations: operations.filter((operation) => operation.status === 'rejected').length,
    oldest_pending_at: oldest === null ? null : new Date(oldest).toISOString(),
    last_sync_at: last ? new Date(last.finishedAt).toISOString() : null,
    last_sync_status: last?.status ?? null,
    last_backup_at: backup ? new Date(backup.at).toISOString() : null,
    storage_persisted: protection.durable ? protection.persisted : null,
  }
}
