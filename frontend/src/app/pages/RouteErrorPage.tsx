import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { config } from '../../shared/config'
import { ErrorState } from '../../shared/ui/ErrorState'
import { Icon } from '../../shared/ui/Icon'

/**
 * Écran qui plante au rendu ou adresse inconnue hors de l'application (D-060) : message français,
 * sans trace technique, avec la marque de l'hôtel (aucune barre latérale à ce niveau).
 */
export function RouteErrorPage() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <main id="contenu" className="error-screen">
      <div className="error-screen__brand">
        <span aria-hidden="true">JB</span>
        <span>{config.appName}</span>
      </div>
      <div role="alert">
        {notFound ? (
          <ErrorState
            code="404"
            tone="warn"
            icon="search"
            title="Page introuvable"
            message="La page demandée n’existe pas ou a été déplacée."
            actions={
              <Link to="/" className="primary">
                <Icon name="dashboard" size={17} />
                Retour à l’accueil
              </Link>
            }
          />
        ) : (
          <ErrorState
            code="500"
            tone="ko"
            icon="refresh"
            title="Erreur inattendue"
            message="L’écran n’a pas pu s’afficher. Aucune donnée n’a été modifiée."
            hint="Rechargez la page ; si le problème persiste, contactez l’administrateur."
            actions={
              <>
                <button type="button" className="primary" onClick={() => window.location.reload()}>
                  <Icon name="refresh" size={17} />
                  Recharger la page
                </button>
                <Link to="/" className="secondary">
                  <Icon name="dashboard" size={17} />
                  Retour à l’accueil
                </Link>
              </>
            }
          />
        )}
      </div>
    </main>
  )
}
