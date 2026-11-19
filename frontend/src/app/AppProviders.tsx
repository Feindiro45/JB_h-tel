import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ME_KEY } from '../features/auth'
import { ApiError } from '../shared/api/errors'
import { ErrorModalProvider } from '../shared/ui/ErrorModalProvider'
import { useErrorModal } from '../shared/ui/errorModalContext'
import { ToastProvider } from '../shared/ui/ToastProvider'
import { createQueryClient } from './queryClient'

function QueryProvider({ children }: { children: ReactNode }) {
  const { showError } = useErrorModal()
  const [client] = useState(() => {
    const queryClient: QueryClient = createQueryClient((error) => {
      showError(error)
      // Session expirée : la modale l'explique et la garde de route renvoie à la connexion.
      if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(ME_KEY, null)
    })
    return queryClient
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
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
