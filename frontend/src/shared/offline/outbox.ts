import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { storageGet, storageSet } from './storage'

/**
 * File d'attente des écritures faites hors ligne (lot 4, D-064). Chaque opération garde sa clé
 * d'idempotence (D-063) : rejouée autant de fois que nécessaire, elle n'est enregistrée qu'une
 * fois par le serveur, qui la revalide entièrement. Une opération refusée n'est jamais effacée.
 */
export type OperationKind =
  | 'payment.record'
  | 'reservation.check-in'
  | 'reservation.check-out'
  | 'customer.create'
  | 'reservation.create'
  | 'reservation.cancel'
  | 'reservation.extend'

export type OperationStatus = 'pending' | 'accepted' | 'rejected' | 'abandoned'

export interface QueuedOperation {
  /** Identifiant de l'opération = clé d'idempotence envoyée au serveur. */
  id: string
  kind: OperationKind
  /** Description lisible (« Encaissement de 20 000 FCFA — chambre 101 »). */
  label: string
  method: 'POST'
  path: string
  body: unknown
  createdAt: number
  /** Auteur : l'opération n'est envoyée qu'avec sa session (journal d'audit fidèle). */
  userId: string
  userName: string
  status: OperationStatus
  attempts: number
  lastAttemptAt: number | null
  error: { title: string; message: string; code: string | null } | null
  /** Numéro imprimé hors ligne (N-03), puis numéro définitif donné par le serveur. */
  provisionalNumber: string | null
  definitiveNumber: string | null
  /** Identifiant local de l'élément affiché en attendant (encaissement provisoire…). */
  localId: string | null
  abandonReason: string | null
  /** Identifiant donné par le serveur à l’élément créé (remplace `local-…` dans la suite). */
  resultId?: string | null
}

const OUTBOX_KEY = 'outbox'
const SEQUENCE_KEY = 'provisional-sequence'

export const OUTBOX_QUERY_KEY = ['offline', 'outbox'] as const

export const outboxQuery = queryOptions({
  queryKey: OUTBOX_QUERY_KEY,
  queryFn: readOutbox,
  networkMode: 'always',
  staleTime: 0,
})

export async function readOutbox(): Promise<QueuedOperation[]> {
  return (await storageGet<QueuedOperation[]>(OUTBOX_KEY)) ?? []
}

/** Remplace la file entière (restauration d’une sauvegarde). */
export async function writeOperations(operations: QueuedOperation[]): Promise<void> {
  if (!(await storageSet(OUTBOX_KEY, operations))) {
    throw new Error(
      'Enregistrement impossible sur ce poste : stockage du navigateur plein ou refusé. L’opération n’a pas été gardée.',
    )
  }
}

export async function enqueueOperation(operation: QueuedOperation): Promise<void> {
  await writeOperations([...(await readOutbox()), operation])
}

export async function updateOperation(
  id: string,
  patch: Partial<QueuedOperation>,
): Promise<QueuedOperation | null> {
  const operations = await readOutbox()
  const index = operations.findIndex((operation) => operation.id === id)
  if (index < 0) return null
  const updated = { ...operations[index]!, ...patch }
  operations[index] = updated
  await writeOperations(operations)
  return updated
}

/** Numéro provisoire `LOC-<poste>-<séquence>` (N-03), unique sur ce poste. */
export async function nextProvisionalNumber(workstationName: string | null): Promise<string> {
  const sequence = ((await storageGet<number>(SEQUENCE_KEY)) ?? 0) + 1
  await storageSet(SEQUENCE_KEY, sequence)
  const station =
    (workstationName ?? '')
      .normalize('NFD')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 12) || 'POSTE'
  return `LOC-${station}-${String(sequence).padStart(6, '0')}`
}

/** Les écrans qui affichent la file d'attente sont rafraîchis. */
export function notifyOutboxChanged(client: QueryClient | null): void {
  void client?.invalidateQueries({ queryKey: OUTBOX_QUERY_KEY })
}
