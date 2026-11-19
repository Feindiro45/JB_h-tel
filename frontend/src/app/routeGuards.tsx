import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useCurrentUser } from '../features/auth'
import { landingPath } from './navigation'

/** Accueil : première page autorisée par les permissions du serveur. */
export function Landing() {
  const { can } = useCurrentUser()
  return <Navigate to={landingPath(can)} replace />
}

/**
 * Déjà connecté : la page de connexion renvoie vers la page demandée avant la connexion
 * (même cible que LoginPage, pour qu'aucune des deux redirections n'écrase l'autre).
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUser()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (!isPending && user) return <Navigate to={from} replace />
  return children
}
