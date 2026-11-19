import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '../shared/api/errors'

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
        if (!query.meta?.silentError) onError(error)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (!mutation.meta?.silentError) onError(error)
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  })
}
