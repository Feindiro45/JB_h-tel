import { useId, type ReactNode } from 'react'
import { config } from '../../shared/config'
import { Icon } from '../../shared/ui/Icon'
import './login.css'

/**
 * Mise en page commune des écrans d'accès (D-059) : connexion, mot de passe oublié, choix du mot
 * de passe. Carte centrée, sans image (demande de l'utilisateur), bandeau vert et or, marque de
 * l'hôtel et rappel de sécurité.
 */
export function AuthLayout({
  title,
  lead,
  children,
  footer = 'Espace réservé au personnel de l’hôtel. Votre session se ferme à la déconnexion.',
}: {
  title: string
  lead?: ReactNode
  children: ReactNode
  footer?: string
}) {
  const titleId = useId()
  return (
    <main id="contenu" className="auth auth--simple">
      <section className="auth-panel" aria-labelledby={titleId}>
        <div className="auth-card">
          <div className="login-brand">
            <span className="login-monogram" aria-hidden="true">
              JB
            </span>
            <span>
              <b>{config.appName}</b>
              <small>Bambari · Hôtellerie</small>
            </span>
          </div>
          <h1 id={titleId}>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
          {children}
          <p className="auth-note">
            <Icon name="shield" size={16} />
            <span>{footer}</span>
          </p>
        </div>
      </section>
    </main>
  )
}

/** Pastille d'état (envoi effectué, mot de passe enregistré…), accompagnée d'un texte. */
export function AuthBadge({ icon, tone = 'green' }: { icon: 'mail' | 'check'; tone?: 'green' }) {
  return (
    <span className={`auth-badge auth-badge--${tone}`} aria-hidden="true">
      <Icon name={icon} size={26} />
    </span>
  )
}
