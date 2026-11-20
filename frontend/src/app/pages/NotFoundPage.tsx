import { Link, useNavigate } from 'react-router'
import { ErrorState } from '../../shared/ui/ErrorState'
import { Icon } from '../../shared/ui/Icon'

/** Adresse inconnue dans l'application (D-060). */
export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <ErrorState
      code="404"
      tone="warn"
      icon="search"
      title="Page introuvable"
      message="La page demandée n’existe pas ou a été déplacée."
      hint="Vérifiez l’adresse, ou utilisez le menu pour retrouver l’écran voulu."
      actions={
        <>
          <Link to="/" className="primary">
            <Icon name="dashboard" size={17} />
            Retour à l’accueil
          </Link>
          <button type="button" className="secondary" onClick={() => navigate(-1)}>
            <Icon name="back" size={17} />
            Page précédente
          </button>
        </>
      }
    />
  )
}
