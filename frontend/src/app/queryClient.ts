import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '../shared/api/errors'
import { getConnectivity } from '../shared/offline/connectivity'
import { isSyncing } from '../shared/offline/localSync'

interface AppMeta extends Record<string, unknown> {
  /** `true` : l'erreur est affichée par l'écran lui-même, pas par la modale globale. */
  silentError?: boolean
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: AppMeta
    mutationMeta: AppMeta
  }
}

/** Début de la coupure déjà signalée par la modale (une seule fenêtre par coupure). */
let notifiedOfflineSince = 0

/** Réessaie une seule fois, et seulement pour une erreur réseau ou serveur. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 1 && error instanceof ApiError && (error.isNetworkError || error.status >= 500)
  )
}

/**
 * Toute erreur d'appel API déclenche la modale d'erreur (règle validée), sauf si la requête
 * déclare `meta: { silentError: true }`.
 */
export function createQueryClient(onError: (error: unknown) => void): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Pendant une mise à jour locale, les échecs vont au journal de synchronisation.
        if (isSyncing()) return
        // Coupure du réseau : « Connexion impossible » une seule fois par coupure, puis le
        // bandeau « Hors ligne » remplace une fenêtre par écran (lot 2).
        if (error instanceof ApiError && error.isNetworkError) {
          const { online, since } = getConnectivity()
          if (!online && since === notifiedOfflineSince) return
          if (!online) notifiedOfflineSince = since
        }
        if (!query.meta?.silentError) onError(error)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (!mutation.meta?.silentError) onError(error)
      },
    }),
    defaultOptions: {
      // Au retour du réseau, la mise à jour locale (journalisée) recharge les données.
      queries: {
        retry: shouldRetry,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 30_000,
      },
      // Une écriture n’est jamais mise en attente en silence : hors ligne, elle échoue avec le
      // message « Connexion impossible » (enregistrement hors ligne : lot 4).
      mutations: { retry: false, networkMode: 'always' },
    },
  })
}
