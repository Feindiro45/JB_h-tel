import { createContext, useContext } from 'react'

export interface ToastContextValue {
  /** Message de confirmation bref (« Réservation enregistrée »), annoncé poliment. */
  notify: (message: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast doit être utilisé à l’intérieur de ToastProvider.')
  return context
}
