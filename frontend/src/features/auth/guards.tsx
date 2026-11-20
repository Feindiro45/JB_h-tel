import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { ErrorState } from '../../shared/ui/ErrorState'
import { Icon } from '../../shared/ui/Icon'
import { LoadingBlock } from '../../shared/ui/layout'
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
      <ErrorState
        code="403"
        tone="ko"
        icon="shield"
        title="Accès refusé"
        message="Votre rôle ne permet pas d’ouvrir cette page."
        hint="Si vous en avez besoin pour votre travail, demandez à l’administrateur de vous donner ce droit."
        actions={
          <Link to="/" className="primary">
            <Icon name="dashboard" size={17} />
            Retour à l’accueil
          </Link>
        }
      />
    )
  }
  return children
}
