import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { RouterProvider } from 'react-router'
import { ErrorModalProvider } from '../shared/ui/ErrorModalProvider'
import { useErrorModal } from '../shared/ui/errorModalContext'
import { createQueryClient } from './queryClient'
import { router } from './router'

function QueryProvider({ children }: { children: ReactNode }) {
  const { showError } = useErrorModal()
  const [client] = useState(() => createQueryClient(showError))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

export function App() {
  return (
    <ErrorModalProvider>
      <QueryProvider>
        <RouterProvider router={router} />
      </QueryProvider>
    </ErrorModalProvider>
  )
}
