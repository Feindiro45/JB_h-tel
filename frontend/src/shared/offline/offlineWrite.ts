import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'
import { apiRequest } from '../api/client'
import { ApiError } from '../api/errors'
import { newIdempotencyKey } from '../api/idempotency'
import type { CurrentUser } from '../api/types'
import { getConnectivity } from './connectivity'
import { dependencyRefusal, localIdFor, resolveLocalRefs } from './localRefs'
import {
  enqueueOperation,
  notifyOutboxChanged,
  readOutbox,
  type OperationKind,
  type QueuedOperation,
} from './outbox'
import { snapshot } from './persistence'
import { getQueryClientRef } from './queryClientRef'
import { isAllowedOffline, OPERATION_LABELS, offlineRules } from './rules'

export interface OfflineWrite<T> {
  kind: OperationKind
  label: string
  path: string
  body: unknown
  /** Clé d'idempotence de l'opération, gardée pour le rejeu. */
  idempotencyKey?: string
  /** Numéro provisoire à imprimer (encaissement hors ligne, N-03). */
  numbered?: boolean
  /** Préfixe du numéro provisoire : `FAC-` pour une facture (FAC-LOC-…, décision du 22/11/2026). */
  numberPrefix?: string
  /** Méthode HTTP (POST par défaut ; PUT pour remplacer les occupants). */
  method?: 'POST' | 'PUT'
  /** Réponse du serveur → résultat ; par défaut le contenu de l'enveloppe `data`. */
  read?: (response: unknown) => T
  /**
   * Vérification sur le poste avant de garder l'opération (chambre déjà prise sur le poste,
   * tarif absent…) : une erreur levée ici est montrée tout de suite et rien n'est gardé.
   */
  validate?: (client: QueryClient) => void
  /** Résultat affiché tout de suite, en attendant l'envoi : met à jour le cache du poste. */
  provisional: (operation: QueuedOperation, client: QueryClient) => T
}

const envelopeData = <T>(response: unknown): T => (response as { data: T }).data

/**
 * Écriture « comme en ligne » (D-064, N-02) : envoyée au serveur s'il répond, sinon gardée sur
 * le poste avec sa clé et rejouée au retour du réseau. Une coupure pendant l'envoi est sans
 * risque : avec la même clé, le serveur n'enregistre l'opération qu'une fois. Les refus du
 * serveur (règle, droit, conflit) restent des erreurs immédiates quand il répond. Une opération
 * sur un élément créé hors ligne (`local-…`) attend que cet élément soit reçu par le serveur.
 */
export async function runOrQueue<T>(write: OfflineWrite<T>): Promise<T> {
  const idempotencyKey = write.idempotencyKey ?? newIdempotencyKey()
  const existing = (await readOutbox()).find((operation) => operation.id === idempotencyKey)
  if (existing) {
    const actor = getQueryClientRef()?.getQueryData<CurrentUser | null>(['auth', 'me'])
    if (!actor || actor.id !== existing.userId)
      throw new ApiError(403, 'Auteur différent', 'Cette opération appartient à une autre session.')
    if (existing.status === 'rejected' || existing.status === 'abandoned')
      throw new ApiError(
        409,
        'Opération à examiner',
        existing.error?.message ?? 'Consultez Synchronisation avant de reprendre cette opération.',
      )
    if (existing.localResult !== undefined) return existing.localResult as T
    throw new ApiError(
      409,
      'Opération déjà gardée',
      'Cette opération est déjà sur le poste. Consultez Synchronisation pour suivre sa reprise.',
    )
  }
  const read = write.read ?? envelopeData<T>
  if (getConnectivity().online) {
    const resolution = resolveLocalRefs(write.path, write.body, await readOutbox())
    if (resolution.ok) {
      try {
        return read(
          await apiRequest<unknown>(resolution.path, {
            method: write.method ?? 'POST',
            body: resolution.body,
            idempotencyKey,
          }),
        )
      } catch (error) {
        if (!(error instanceof ApiError && error.isNetworkError)) throw error
      }
    } else if (resolution.refused) {
      throw dependencyRefusal(resolution.waitingFor)
    }
    // Élément créé hors ligne pas encore reçu par le serveur : l'opération attend son tour.
  }

  const client = getQueryClientRef()
  if (!client) throw new Error('Application non initialisée.')
  const user = client.getQueryData<CurrentUser | null>(['auth', 'me'])
  if (!user) throw new ApiError(401, 'Session requise', 'Reconnectez-vous pour enregistrer.')
  const rules = offlineRules(client)
  if (!isAllowedOffline(write.kind, rules)) {
    throw new ApiError(
      403,
      'Opération non permise hors ligne',
      `« ${OPERATION_LABELS[write.kind]} » n’est pas permis sans Internet sur ce poste (Paramètres → Hors ligne). Réessayez au retour du réseau.`,
      {},
      'offline_operation_not_allowed',
    )
  }
  write.validate?.(client)
  const station = client.getQueryData<{ name: string } | null>(['workstation', 'self'])

  const operation: QueuedOperation = {
    id: idempotencyKey,
    kind: write.kind,
    label: write.label,
    method: write.method ?? 'POST',
    path: write.path,
    body: write.body,
    createdAt: Date.now(),
    userId: user.id,
    userName: user.name,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    error: null,
    provisionalNumber: null,
    definitiveNumber: null,
    localId: localIdFor(idempotencyKey),
    abandonReason: null,
    resultId: null,
  }
  const before = dehydrate(client)
  let saved: QueuedOperation
  try {
    saved = await enqueueOperation(
      operation,
      write.numbered
        ? {
            station: station?.name ?? null,
            prefix: rules.provisional_prefix,
            documentPrefix: write.numberPrefix,
          }
        : undefined,
      (item) => {
        item.localResult = write.provisional(item, client)
        // File, compteur, facture provisoire et copie des écrans sont validés ensemble.
        return { 'query-cache': snapshot(client) }
      },
    )
  } catch (error) {
    client.clear()
    hydrate(client, before)
    throw error
  }
  notifyOutboxChanged(client)
  return saved.localResult as T
}
