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
import { sendPendingOperations } from '../shared/offline/outboxSync'
import { setQueryClientRef } from '../shared/offline/queryClientRef'
import { confirmSessionOnline, forgetSession } from '../shared/offline/session'
import { requestPersistentStorage } from '../shared/offline/storage'
import { SYNC_LOG_KEY } from '../shared/offline/syncQueries'
import { ErrorModalProvider } from '../shared/ui/ErrorModalProvider'
import { useErrorModal } from '../shared/ui/errorModalContext'
import { LoadingBlock } from '../shared/ui/layout'
import { ToastProvider } from '../shared/ui/ToastProvider'
import { createQueryClient } from './queryClient'

/**
 * Synchronisation dans les deux sens : d’abord l’envoi des opérations faites hors ligne (lot 4),
 * puis la mise à jour de la copie du poste, pour que le serveur n’écrase pas une opération qui
 * n’est pas encore partie.
 */
async function synchronize(
  client: QueryClient,
  trigger: 'reconnect' | 'auto',
  user: CurrentUser,
): Promise<void> {
  await sendPendingOperations(client, trigger, user)
  if (trigger === 'reconnect') await updateLocalCopy(client, trigger, user.name)
  await client.invalidateQueries({ queryKey: SYNC_LOG_KEY })
}

/**
 * Mode hors ligne (lot 2, D-064) : copie locale restaurée avant le premier affichage,
 * enregistrée après chaque lecture réussie, mise à jour (et journalisée) au retour du réseau,
 * effacée quand le serveur déclare la session expirée.
 */
let persistenceAsked: Promise<boolean | null> | null = null

function useOfflineCopy(client: QueryClient): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    void restoreQueryCache(client).finally(() => {
      if (active) setReady(true)
      // Les données restaurées peuvent être fraîches : l’accès au serveur est vérifié une fois ;
      // en ligne, les opérations restées en attente d’une session précédente partent aussitôt.
      void checkConnectivity().then((reachable) => {
        const user = client.getQueryData<CurrentUser | null>(ME_KEY)
        if (active && reachable && user) void synchronize(client, 'auto', user)
      })
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
        if (!user || !getConnectivity().online) return
        // Le serveur vient de confirmer la session : date de dernière connexion mise à jour.
        void confirmSessionOnline(user)
        // Données du poste protégées contre l’effacement automatique du navigateur (une fois).
        persistenceAsked ??= requestPersistentStorage()
      }),
    [client],
  )

  useEffect(() => {
    let wasOnline = getConnectivity().online
    return subscribeConnectivity(() => {
      const online = getConnectivity().online
      const user = client.getQueryData<CurrentUser | null>(ME_KEY)
      if (online && !wasOnline && user) void synchronize(client, 'reconnect', user)
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
    // Écritures hors ligne (lot 4) : accès au cache en dehors des composants.
    setQueryClientRef(queryClient)
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
