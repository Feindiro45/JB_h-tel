import { Link, Outlet } from 'react-router'
import { config } from '../shared/config'

export function RootLayout() {
  return (
    <div className="layout">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <header className="layout__header">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true">
            JB
          </span>
          <span className="brand__name">{config.appName}</span>
        </Link>
        <span className="layout__subtitle">Chambres, réservations et caisse</span>
      </header>
      <main id="contenu" className="layout__main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
