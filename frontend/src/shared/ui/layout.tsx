import { useContext, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { PageHeadingExtrasContext } from './pageHeadingExtras'
import { useConnectivity } from '../offline/connectivity'

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  icon = 'document',
}: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: IconName
}) {
  // Bouton « Tutoriel » de la section, fourni par le shell (lot T).
  const extra = useContext(PageHeadingExtrasContext)
  return (
    <header className="page-heading">
      <div className="page-heading__intro">
        <span className="page-heading__icon" aria-hidden="true">
          <Icon name={icon} size={34} />
        </span>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {description && <p className="description">{description}</p>}
        </div>
      </div>
      {(actions || extra) && (
        <div className="heading-actions">
          {actions}
          {extra}
        </div>
      )}
    </header>
  )
}

export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-title">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Metric({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  icon: IconName
  tone?: 'green' | 'amber' | 'blue' | 'mint' | 'red'
}) {
  return (
    <article
      className={`metric metric--${tone ?? ({ document: 'amber', chart: 'blue', rooms: 'mint' } as Record<string, string>)[icon] ?? 'green'}`}
    >
      <span className="metric__icon">
        <Icon name={icon} size={30} />
      </span>
      <div className="metric__content">
        <p className="metric__label">{label}</p>
        <strong className="metric__value">{value}</strong>
        <p className="metric__hint">{hint}</p>
      </div>
    </article>
  )
}

export function EmptyState({
  title = 'Aucun résultat',
  children = 'Ajustez vos filtres ou enregistrez une nouvelle opération.',
}: {
  title?: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      <span aria-hidden="true">◇</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}

/**
 * Squelette de chargement (lignes animées), annoncé aux lecteurs d'écran. Hors ligne, une donnée
 * jamais gardée sur le poste ne viendra pas : un message explique comment la rendre disponible, au
 * lieu d’un chargement sans fin (lot 2).
 */
export function LoadingBlock({
  lines = 4,
  label = 'Chargement…',
  offlineHint = true,
}: {
  lines?: number
  label?: string
  /** `false` pour un chargement qui ne dépend pas du réseau (ouverture de l’application). */
  offlineHint?: boolean
}) {
  const { online } = useConnectivity()
  if (!online && offlineHint) {
    return (
      <div className="notice loading-offline" role="status">
        <strong>Pas encore disponible hors ligne.</strong> Ces données n’ont pas été gardées sur ce
        poste. Ouvrez cet écran une fois en ligne, ou lancez « Mettre à jour en local » dans le menu
        Synchronisation avant une coupure.
      </div>
    )
  }
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton" style={{ width: `${90 - index * 12}%` }} />
      ))}
    </div>
  )
}

export function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pair">
      <small>{label}</small>
      <strong>{children}</strong>
    </div>
  )
}
