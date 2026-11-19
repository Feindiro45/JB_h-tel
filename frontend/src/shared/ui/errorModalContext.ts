import { createContext, useContext } from 'react'

export interface ErrorModalContextValue {
  /** Affiche l'erreur dans la modale accessible (message français, sans détail technique). */
  showError: (error: unknown) => void
}

export const ErrorModalContext = createContext<ErrorModalContextValue | null>(null)

export function useErrorModal(): ErrorModalContextValue {
  const context = useContext(ErrorModalContext)
  if (!context)
    throw new Error('useErrorModal doit être utilisé à l’intérieur de ErrorModalProvider.')
  return context
}
