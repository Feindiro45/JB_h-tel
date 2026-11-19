import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="card" aria-labelledby="not-found-title">
      <h1 id="not-found-title">Page introuvable</h1>
      <p>La page demandée n'existe pas ou a été déplacée.</p>
      <Link to="/" className="button button--primary">
        Retour à l'accueil
      </Link>
    </section>
  )
}
