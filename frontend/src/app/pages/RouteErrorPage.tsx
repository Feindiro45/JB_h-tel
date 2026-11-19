import { Link } from 'react-router'

/** Affiché si un écran plante au rendu : message français, sans trace technique. */
export function RouteErrorPage() {
  return (
    <main className="layout__main">
      <section className="card" role="alert" aria-labelledby="route-error-title">
        <h1 id="route-error-title">Erreur inattendue</h1>
        <p>
          L'écran n'a pas pu s'afficher. Rechargez la page ; si le problème persiste, contactez
          l'administrateur.
        </p>
        <Link to="/" className="button button--primary">
          Retour à l'accueil
        </Link>
      </section>
    </main>
  )
}
