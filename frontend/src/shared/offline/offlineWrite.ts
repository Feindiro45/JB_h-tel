import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/errors'
import { newIdempotencyKey } from '../api/idempotency'
import type { CurrentUser } from '../api/types'
import { getConnectivity } from './connectivity'
import {
  enqueueOperation,
  nextProvisionalNumber,
  notifyOutboxChanged,
  type OperationKind,
  type QueuedOperation,
} from './outbox'
import { saveQueryCache } from './persistence'
import { getQueryClientRef } from './queryClientRef'

export interface OfflineWrite<T> {
  kind: OperationKind
  label: string
  path: string
  body: unknown
  /** Clé d'idempotence de l'opération, gardée pour le rejeu. */
  idempotencyKey?: string
  /** Numéro provisoire à imprimer (encaissement hors ligne, N-03). */
  numbered?: boolean
  /** Envoi direct au serveur, avec la même clé. */
  send: (idempotencyKey: string) => Promise<T>
  /** Résultat affiché tout de suite, en attendant l'envoi : met à jour le cache du poste. */
  provisional: (operation: QueuedOperation, client: QueryClient) => T
}

/**
 * Écriture « comme en ligne » (D-064, N-02) : envoyée au serveur s'il répond ; sinon gardée sur
 * le poste avec sa clé et rejouée au retour du réseau. Une coupure pendant l'envoi est sans
 * risque : avec la même clé, le serveur n'enregistre l'opération qu'une fois. Les refus du
 * serveur (règle, droit, conflit) restent des erreurs immédiates quand il répond.
 */
export async function runOrQueue<T>(write: OfflineWrite<T>): Promise<T> {
  const idempotencyKey = write.idempotencyKey ?? newIdempotencyKey()
  if (getConnectivity().online) {
    try {
      return await write.send(idempotencyKey)
    } catch (error) {
      if (!(error instanceof ApiError && error.isNetworkError)) throw error
    }
  }

  const client = getQueryClientRef()
  if (!client) throw new Error('Application non initialisée.')
  const user = client.getQueryData<CurrentUser | null>(['auth', 'me'])
  if (!user) throw new ApiError(401, 'Session requise', 'Reconnectez-vous pour enregistrer.')
  const station = client.getQueryData<{ name: string } | null>(['workstation', 'self'])

  const operation: QueuedOperation = {
    id: idempotencyKey,
    kind: write.kind,
    label: write.label,
    method: 'POST',
    path: write.path,
    body: write.body,
    createdAt: Date.now(),
    userId: user.id,
    userName: user.name,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    error: null,
    provisionalNumber: write.numbered ? await nextProvisionalNumber(station?.name ?? null) : null,
    definitiveNumber: null,
    localId: newIdempotencyKey(),
    abandonReason: null,
  }
  await enqueueOperation(operation)
  const result = write.provisional(operation, client)
  // Copie du poste enregistrée tout de suite : un rechargement immédiat garde l'élément provisoire.
  await saveQueryCache(client).catch(() => undefined)
  notifyOutboxChanged(client)
  return result
}
