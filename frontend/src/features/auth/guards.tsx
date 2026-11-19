import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { LoadingBlock, PageHeading } from '../../shared/ui/layout'
import { useCurrentUser } from './api'

/** Toute l'application exige une session ; sinon, retour à la connexion puis à la page demandée. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUser()
  const location = useLocation()

  if (isPending) {
    return (
      <main id="contenu" className="auth-panel" style={{ minHeight: '100svh' }}>
        <LoadingBlock label="Vérification de la session…" />
      </main>
    )
  }
  if (!user) {
    return (
      <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />
    )
  }
  return children
}

/** L'interface reflète les droits du serveur : sans la permission, la page n'est pas proposée. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string
  children: ReactNode
}) {
  const { can } = useCurrentUser()
  if (!can(permission)) {
    return (
      <PageHeading
        eyebrow="Accès"
        title="Accès refusé"
        description="Votre rôle ne permet pas d’ouvrir cette page. Contactez l’administrateur si vous en avez besoin."
      />
    )
  }
  return children
}
