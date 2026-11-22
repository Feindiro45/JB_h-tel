import type { QueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { toUserError } from '../api/errors'
import { newIdempotencyKey } from '../api/idempotency'
import { getConnectivity } from './connectivity'
import { dependencyRefusal, resolveLocalRefs } from './localRefs'
import { notifyOutboxChanged, readOutbox, updateOperation, type QueuedOperation } from './outbox'
import { createLimiter, RETRY_AFTER_429_MS, sleep } from './pacing'
import { appendRun, statusOf, type SyncFailure, type SyncRun, type SyncTrigger } from './syncLog'

let sending = false

/** Identifiant de l'élément créé par le serveur (client, réservation…). */
function resultIdOf(response: unknown): string | null {
  const id = (response as { data?: { id?: unknown } } | null)?.data?.id
  return typeof id === 'string' ? id : null
}

/**
 * Éléments provisoires (`local-…`) d'opérations déjà reçues par le serveur : retirés du poste, les
 * données du serveur les remplacent (une réservation ne compte pas deux fois dans les chambres
 * libres). Fait au passage suivant, quand l'écran provisoire a déjà basculé sur la fiche définitive.
 */
export function forgetSentLocalItems(client: QueryClient, operations: QueuedOperation[]): void {
  const sent = new Set(
    operations.flatMap((o) => (o.status === 'accepted' && o.localId ? [o.localId] : [])),
  )
  if (sent.size === 0) return
  client.removeQueries({
    predicate: (query) => query.queryKey.some((part) => typeof part === 'string' && sent.has(part)),
  })
  for (const query of client.getQueryCache().getAll()) {
    const data = query.state.data as { data?: unknown } | undefined
    if (!data || typeof data !== 'object' || !Array.isArray(data.data)) continue
    const rows = data.data as { id?: unknown }[]
    if (!rows.some((row) => typeof row?.id === 'string' && sent.has(row.id))) continue
    client.setQueryData(query.queryKey, {
      ...data,
      data: rows.filter((row) => !(typeof row?.id === 'string' && sent.has(row.id))),
    })
  }
}

/** Numéro définitif renvoyé par le serveur (reçu d'un encaissement). */
function definitiveNumberOf(operation: QueuedOperation, response: unknown): string | null {
  const data = (response as { data?: { receipt_number?: string; number?: string } } | null)?.data
  if (operation.kind === 'payment.record') return data?.receipt_number ?? null
  // Facture émise hors ligne : FAC-LOC-… devient le numéro FAC définitif.
  if (operation.kind === 'invoice.issue') return data?.number ?? null
  return null
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
  options: { perMinute?: number; retryDelayMs?: number } = {},
): Promise<SyncRun | null> {
  if (sending || !user) return null
  // Toute la file (tous auteurs) : un élément créé hors ligne peut l'avoir été par un collègue.
  const known = await readOutbox()
  forgetSentLocalItems(client, known)
  const pending = known
    .filter((operation) => operation.status === 'pending' && operation.userId === user.id)
    .sort((a, b) => a.createdAt - b.createdAt)
  if (pending.length === 0) return null

  sending = true
  const startedAt = Date.now()
  const failures: SyncFailure[] = []
  let accepted = 0
  const remember = (updated: QueuedOperation | null) => {
    if (!updated) return
    const index = known.findIndex((operation) => operation.id === updated.id)
    if (index >= 0) known[index] = updated
  }
  // Après une longue coupure, des centaines d’opérations : envoi une par une, dans l’ordre, à un
  // rythme que le serveur accepte (120 par minute) ; un « trop de requêtes » est réessayé.
  const limit = createLimiter(options.perMinute, 1)
  const send = async (operation: QueuedOperation, path: string, body: unknown) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await limit(() =>
          apiRequest<unknown>(path, {
            method: operation.method,
            body,
            idempotencyKey: operation.id,
          }),
        )
      } catch (error) {
        if (!(toUserError(error).status === 429 && attempt < 3)) throw error
        await sleep(options.retryDelayMs ?? RETRY_AFTER_429_MS)
      }
    }
  }
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
      // Élément créé hors ligne (`local-…`) : remplacé par l'identifiant donné par le serveur.
      const resolution = resolveLocalRefs(operation.path, operation.body, known)
      if (!resolution.ok) {
        if (resolution.refused) {
          const error = dependencyRefusal(resolution.waitingFor)
          failures.push({ dataset: operation.label, cause: error.message })
          remember(
            await updateOperation(operation.id, {
              status: 'rejected',
              error: { title: error.title, message: error.message, code: error.code },
            }),
          )
        } else {
          const origin = resolution.waitingFor
          failures.push({
            dataset: operation.label,
            cause: `En attente de l’envoi de « ${origin.label} » (${origin.userName}).`,
          })
        }
        continue
      }
      const attempt = { attempts: operation.attempts + 1, lastAttemptAt: Date.now() }
      try {
        const response = await send(operation, resolution.path, resolution.body)
        remember(
          await updateOperation(operation.id, {
            ...attempt,
            status: 'accepted',
            error: null,
            definitiveNumber: definitiveNumberOf(operation, response),
            resultId: resultIdOf(response),
          }),
        )
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
        remember(
          await updateOperation(operation.id, {
            ...attempt,
            status: temporary ? 'pending' : 'rejected',
            error: detail,
          }),
        )
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
