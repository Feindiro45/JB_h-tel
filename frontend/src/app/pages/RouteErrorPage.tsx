import { Link } from 'react-router'

/** Affiché si un écran plante au rendu : message français, sans trace technique. */
export function RouteErrorPage() {
  return (
    <main id="contenu" className="auth-panel" style={{ minHeight: '100svh' }}>
      <section
        className="panel"
        role="alert"
        aria-labelledby="route-error-title"
        style={{ padding: 24, maxWidth: 520 }}
      >
        <h1 id="route-error-title">Erreur inattendue</h1>
        <p>
          L’écran n’a pas pu s’afficher. Rechargez la page ; si le problème persiste, contactez
          l’administrateur.
        </p>
        <Link to="/" className="primary">
          Retour à l’accueil
        </Link>
      </section>
    </main>
  )
}
