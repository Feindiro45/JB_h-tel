import { Link } from 'react-router'
import { PageHeading } from '../../shared/ui/layout'

export function NotFoundPage() {
  return (
    <PageHeading
      eyebrow="Erreur 404"
      title="Page introuvable"
      description="La page demandée n’existe pas ou a été déplacée."
      actions={
        <Link to="/" className="primary">
          Retour à l’accueil
        </Link>
      }
    />
  )
}
