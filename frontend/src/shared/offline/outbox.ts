import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { storageGet, storageMutate } from './storage'

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
  | 'reservation.confirm'
  | 'reservation.occupants'
  | 'reservation.modify'
  | 'invoice.issue'

export type OperationStatus = 'pending' | 'accepted' | 'rejected' | 'abandoned'

export interface QueuedOperation {
  /** Identifiant de l'opération = clé d'idempotence envoyée au serveur. */
  id: string
  kind: OperationKind
  /** Description lisible (« Encaissement de 20 000 FCFA — chambre 101 »). */
  label: string
  method: 'POST' | 'PUT'
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
  automaticInvoiceId?: string | null
  /** Résultat provisoire permettant de reprendre exactement une saisie après interruption. */
  localResult?: unknown
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
  await storageMutate([], () => ({ values: { [OUTBOX_KEY]: operations }, result: undefined }))
}

export interface OperationNumbering {
  station: string | null
  prefix: string
  documentPrefix?: string
}

function provisionalNumber(sequence: number, stationName: string | null, prefix: string): string {
  const station =
    (stationName ?? '')
      .normalize('NFD')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 12) || 'POSTE'
  return `${prefix}-${station}-${String(sequence).padStart(6, '0')}`
}

export async function enqueueOperation(
  operation: QueuedOperation,
  numbering?: OperationNumbering,
  project?: (operation: QueuedOperation) => Record<string, unknown>,
): Promise<QueuedOperation> {
  return storageMutate([OUTBOX_KEY, SEQUENCE_KEY], (values) => {
    const operations = (values[OUTBOX_KEY] as QueuedOperation[] | undefined) ?? []
    const existing = operations.find((item) => item.id === operation.id)
    if (existing) return { values: {}, result: existing }
    let sequence = (values[SEQUENCE_KEY] as number | undefined) ?? 0
    const saved = { ...operation }
    if (numbering) {
      sequence++
      saved.provisionalNumber = `${numbering.documentPrefix ?? ''}${provisionalNumber(sequence, numbering.station, numbering.prefix)}`
    }
    const projection = project?.(saved) ?? {}
    return {
      values: { ...projection, [OUTBOX_KEY]: [...operations, saved], [SEQUENCE_KEY]: sequence },
      result: saved,
    }
  })
}

/** Restauration additive et atomique : ne peut écraser un ajout ou un accusé concurrent. */
export async function mergeOperations(
  incoming: QueuedOperation[],
): Promise<{ added: number; present: number }> {
  return storageMutate([OUTBOX_KEY, SEQUENCE_KEY], (values) => {
    const current = (values[OUTBOX_KEY] as QueuedOperation[] | undefined) ?? []
    const known = new Set(current.map((item) => item.id))
    const added = incoming.filter((item) => {
      if (known.has(item.id)) return false
      known.add(item.id)
      return true
    })
    const sequence = Math.max(
      (values[SEQUENCE_KEY] as number | undefined) ?? 0,
      ...added.map((item) => Number(item.provisionalNumber?.match(/-(\d+)$/)?.[1] ?? 0)),
    )
    return {
      values: {
        [OUTBOX_KEY]: [...current, ...added].sort((a, b) => a.createdAt - b.createdAt),
        [SEQUENCE_KEY]: sequence,
      },
      result: { added: added.length, present: incoming.length - added.length },
    }
  })
}

export async function updateOperation(
  id: string,
  patch: Partial<QueuedOperation>,
): Promise<QueuedOperation | null> {
  return storageMutate([OUTBOX_KEY], (values) => {
    const operations = (values[OUTBOX_KEY] as QueuedOperation[] | undefined) ?? []
    const index = operations.findIndex((operation) => operation.id === id)
    if (index < 0) return { values: {}, result: null }
    const updated = { ...operations[index]!, ...patch }
    operations[index] = updated
    return { values: { [OUTBOX_KEY]: operations }, result: updated }
  })
}

/** Numéro provisoire `LOC-<poste>-<séquence>` (N-03), unique sur ce poste. */
export async function nextProvisionalNumber(
  workstationName: string | null,
  prefix = 'LOC',
): Promise<string> {
  return storageMutate([SEQUENCE_KEY], (values) => {
    const sequence = ((values[SEQUENCE_KEY] as number | undefined) ?? 0) + 1
    return {
      values: { [SEQUENCE_KEY]: sequence },
      result: provisionalNumber(sequence, workstationName, prefix),
    }
  })
}

/** Les écrans qui affichent la file d'attente sont rafraîchis. */
export function notifyOutboxChanged(client: QueryClient | null): void {
  void client?.invalidateQueries({ queryKey: OUTBOX_QUERY_KEY })
}
