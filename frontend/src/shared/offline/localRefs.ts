import { getQueryClientRef } from './queryClientRef'
import type { QueuedOperation } from './outbox'
import { ApiError } from '../api/errors'

/**
 * Éléments créés hors ligne (lot 4, 4.5) : client, réservation… reçoivent l'identifiant provisoire
 * `local-<clé de l'opération qui les crée>`. Une opération qui en dépend (encaissement sur une
 * réservation créée hors ligne) garde cette référence ; à l'envoi, elle est remplacée par
 * l'identifiant donné par le serveur à l'opération créatrice.
 */
export const LOCAL_PREFIX = 'local-'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const LOCAL_REF = new RegExp(`${LOCAL_PREFIX}(${UUID})`, 'g')

export function isLocalId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(LOCAL_PREFIX)
}

export function localIdFor(operationId: string): string {
  return `${LOCAL_PREFIX}${operationId}`
}

/** Clé de l'opération qui a créé l'élément local. */
export function operationIdOf(localId: string): string {
  return localId.slice(LOCAL_PREFIX.length)
}

export type Resolution =
  | { ok: true; path: string; body: unknown }
  | { ok: false; waitingFor: QueuedOperation; refused: false }
  | { ok: false; waitingFor: QueuedOperation | null; refused: true }

/**
 * Remplace les références locales par les identifiants du serveur. Échoue si l'opération créatrice
 * attend encore son envoi, ou si elle a été refusée, abandonnée ou perdue.
 */
export function resolveLocalRefs(
  path: string,
  body: unknown,
  operations: readonly QueuedOperation[],
): Resolution {
  const text = JSON.stringify({ path, body: body ?? null })
  const ids = new Set([...text.matchAll(LOCAL_REF)].map((match) => match[1]!))
  const resolved = new Map<string, string>()
  for (const id of ids) {
    const origin = operations.find((operation) => operation.id === id)
    if (!origin) return { ok: false, waitingFor: null, refused: true }
    if (origin.status === 'accepted' && origin.resultId) {
      resolved.set(id, origin.resultId)
    } else if (origin.status === 'pending') {
      return { ok: false, waitingFor: origin, refused: false }
    } else {
      return { ok: false, waitingFor: origin, refused: true }
    }
  }
  if (ids.size === 0) return { ok: true, path, body }
  const replaced = JSON.parse(
    text.replace(LOCAL_REF, (match, id: string) => resolved.get(id) ?? match),
  ) as { path: string; body: unknown }
  return { ok: true, path: replaced.path, body: body === undefined ? undefined : replaced.body }
}

/** Cause lisible d'une dépendance refusée (opération créatrice refusée, abandonnée ou perdue). */
export function dependencyRefusal(origin: QueuedOperation | null): ApiError {
  return new ApiError(
    409,
    'Opération liée refusée',
    origin
      ? `Elle dépend de « ${origin.label} », ${origin.status === 'abandoned' ? 'abandonnée' : 'refusée par le serveur'} : corrigez la situation en ligne, puis abandonnez cette opération.`
      : 'L’élément créé hors ligne dont elle dépend est introuvable sur ce poste : refaites l’opération en ligne.',
    {},
    'dependency_refused',
  )
}

/**
 * Requêtes d'un élément créé hors ligne : jamais demandées au serveur (qui ne le connaît pas
 * encore) ; le contenu vient du poste. Après l'envoi, l'écran passe à l'identifiant du serveur.
 */
export function localQuery<T>(queryKey: readonly unknown[], fallback?: T) {
  return {
    queryFn: async (): Promise<T> => {
      const cached = getQueryClientRef()?.getQueryData<T>(queryKey)
      if (cached !== undefined) return cached
      if (fallback !== undefined) return fallback
      throw new ApiError(
        404,
        'Élément introuvable sur ce poste',
        'Cet élément créé hors ligne n’est plus sur ce poste. Ouvrez Synchronisation pour suivre son envoi.',
      )
    },
    networkMode: 'always' as const,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  }
}
