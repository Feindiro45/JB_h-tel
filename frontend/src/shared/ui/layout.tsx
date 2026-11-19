import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="description">{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
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
}: {
  label: string
  value: string
  hint: string
  icon: IconName
}) {
  return (
    <article className="metric">
      <div>
        <Icon name={icon} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{hint}</p>
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

/** Squelette de chargement (lignes animées), annoncé aux lecteurs d'écran. */
export function LoadingBlock({
  lines = 4,
  label = 'Chargement…',
}: {
  lines?: number
  label?: string
}) {
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
