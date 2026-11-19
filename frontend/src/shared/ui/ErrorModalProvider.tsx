import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { toUserError, type ApiError } from '../api/errors'
import { ErrorDialog } from './ErrorDialog'
import { ErrorModalContext } from './errorModalContext'

export function ErrorModalProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<ApiError | null>(null)

  const showError = useCallback((value: unknown) => setError(toUserError(value)), [])
  const value = useMemo(() => ({ showError }), [showError])

  return (
    <ErrorModalContext.Provider value={value}>
      {children}
      {error && (
        <ErrorDialog
          title={error.title}
          message={error.message}
          details={error.fieldMessages}
          onClose={() => setError(null)}
        />
      )}
    </ErrorModalContext.Provider>
  )
}
