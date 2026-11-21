import type { QueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { toUserError } from '../api/errors'
import { newIdempotencyKey } from '../api/idempotency'
import { getConnectivity } from './connectivity'
import { notifyOutboxChanged, readOutbox, updateOperation, type QueuedOperation } from './outbox'
import { appendRun, statusOf, type SyncFailure, type SyncRun, type SyncTrigger } from './syncLog'

let sending = false

/** Numéro définitif renvoyé par le serveur (reçu d'un encaissement). */
function definitiveNumberOf(operation: QueuedOperation, response: unknown): string | null {
  if (operation.kind !== 'payment.record') return null
  const data = (response as { data?: { receipt_number?: string } } | null)?.data
  return data?.receipt_number ?? null
}

/**
 * « Mettre à jour en ligne » (lot 4) : rejoue dans l'ordre les opérations en attente de
 * l'utilisateur connecté, chacune avec sa clé d'idempotence. Le serveur les revalide :
 * - acceptée : numéro définitif gardé, données du poste rechargées ;
 * - refusée (règle, droit, conflit) : gardée avec sa cause, jamais effacée (D-064) ;
 * - réseau coupé, session expirée ou erreur passagère : l'envoi s'arrête, l'opération attend.
 * Chaque passage est journalisé (sens « Vers le serveur »).
 */
export async function sendPendingOperations(
  client: QueryClient,
  trigger: SyncTrigger,
  user: { id: string; name: string } | null,
): Promise<SyncRun | null> {
  if (sending || !user) return null
  const pending = (await readOutbox())
    .filter((operation) => operation.status === 'pending' && operation.userId === user.id)
    .sort((a, b) => a.createdAt - b.createdAt)
  if (pending.length === 0) return null

  sending = true
  const startedAt = Date.now()
  const failures: SyncFailure[] = []
  let accepted = 0
  try {
    for (const operation of pending) {
      if (!getConnectivity().online) {
        failures.push({
          dataset: operation.label,
          cause:
            'Connexion impossible : le serveur n’est pas joignable. Réessayez au retour du réseau.',
        })
        break
      }
      const attempt = { attempts: operation.attempts + 1, lastAttemptAt: Date.now() }
      try {
        const response = await apiRequest<unknown>(operation.path, {
          method: operation.method,
          body: operation.body,
          idempotencyKey: operation.id,
        })
        await updateOperation(operation.id, {
          ...attempt,
          status: 'accepted',
          error: null,
          definitiveNumber: definitiveNumberOf(operation, response),
        })
        accepted++
      } catch (cause) {
        const error = toUserError(cause)
        const detail = { title: error.title, message: error.message, code: error.code }
        failures.push({ dataset: operation.label, cause: error.message })
        const temporary =
          error.isNetworkError ||
          error.status === 401 ||
          error.status === 429 ||
          error.status >= 500
        await updateOperation(operation.id, {
          ...attempt,
          status: temporary ? 'pending' : 'rejected',
          error: detail,
        })
        // Coupure, session expirée ou serveur indisponible : la suite attendra le prochain passage.
        if (temporary) break
      }
    }
  } finally {
    sending = false
  }

  const run: SyncRun = {
    id: newIdempotencyKey(),
    direction: 'online',
    trigger,
    startedAt,
    finishedAt: Date.now(),
    status: statusOf(accepted, failures.length),
    datasets: accepted,
    records: accepted,
    skipped: 0,
    bytes: null,
    failures,
    user: user.name,
  }
  await appendRun(run)
  // Les éléments provisoires laissent la place aux données confirmées par le serveur.
  if (accepted > 0) await client.invalidateQueries()
  notifyOutboxChanged(client)
  return run
}
