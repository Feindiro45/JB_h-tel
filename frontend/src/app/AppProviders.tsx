import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { ME_KEY } from '../features/auth'
import { ApiError } from '../shared/api/errors'
import type { CurrentUser } from '../shared/api/types'
import {
  checkConnectivity,
  getConnectivity,
  subscribeConnectivity,
} from '../shared/offline/connectivity'
import { recordAutoSave, updateLocalCopy } from '../shared/offline/localSync'
import {
  clearQueryCache,
  persistQueryCache,
  restoreQueryCache,
} from '../shared/offline/persistence'
import { confirmSessionOnline, forgetSession } from '../shared/offline/session'
import { SYNC_LOG_KEY } from '../shared/offline/syncQueries'
import { ErrorModalProvider } from '../shared/ui/ErrorModalProvider'
import { useErrorModal } from '../shared/ui/errorModalContext'
import { LoadingBlock } from '../shared/ui/layout'
import { ToastProvider } from '../shared/ui/ToastProvider'
import { createQueryClient } from './queryClient'

/**
 * Mode hors ligne (lot 2, D-064) : copie locale restaurée avant le premier affichage,
 * enregistrée après chaque lecture réussie, mise à jour (et journalisée) au retour du réseau,
 * effacée quand le serveur déclare la session expirée.
 */
function useOfflineCopy(client: QueryClient): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    void restoreQueryCache(client).finally(() => {
      if (active) setReady(true)
      // Les données restaurées peuvent être fraîches : l’accès au serveur est vérifié une fois.
      void checkConnectivity()
    })
    return () => {
      active = false
    }
  }, [client])

  useEffect(
    () =>
      persistQueryCache(
        client,
        (cache) => void recordAutoSave(client, cache),
        (error) => void recordAutoSave(client, null, error),
      ),
    [client],
  )

  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return
        if (event.query.queryKey[0] !== ME_KEY[0] || event.query.queryKey[1] !== ME_KEY[1]) return
        const user = event.query.state.data as CurrentUser | null
        // Le serveur vient de confirmer la session : le délai hors ligne de 12 h repart.
        if (user && getConnectivity().online) void confirmSessionOnline(user)
      }),
    [client],
  )

  useEffect(() => {
    let wasOnline = getConnectivity().online
    return subscribeConnectivity(() => {
      const online = getConnectivity().online
      const user = client.getQueryData<CurrentUser | null>(ME_KEY)
      if (online && !wasOnline && user) {
        void updateLocalCopy(client, 'reconnect', user.name).then(() =>
          client.invalidateQueries({ queryKey: SYNC_LOG_KEY }),
        )
      }
      wasOnline = online
    })
  }, [client])

  return ready
}

function QueryProvider({ children }: { children: ReactNode }) {
  const { showError } = useErrorModal()
  const [client] = useState(() => {
    const queryClient: QueryClient = createQueryClient((error) => {
      showError(error)
      // Session expirée : la modale l'explique et la garde de route renvoie à la connexion ;
      // la copie hors ligne de cette session est effacée (D-064).
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(ME_KEY, null)
        void clearQueryCache()
        void forgetSession()
      }
    })
    return queryClient
  })
  const ready = useOfflineCopy(client)
  return (
    <QueryClientProvider client={client}>
      {ready ? children : <LoadingBlock label="Ouverture de l’application…" offlineHint={false} />}
    </QueryClientProvider>
  )
}

/** Fournisseurs globaux : modale d'erreur, notifications brèves, cache des requêtes. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorModalProvider>
      <ToastProvider>
        <QueryProvider>{children}</QueryProvider>
      </ToastProvider>
    </ErrorModalProvider>
  )
}
