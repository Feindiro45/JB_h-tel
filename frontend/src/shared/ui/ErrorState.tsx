import { useId, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './errorState.css'

/**
 * Page d'erreur de l'application (D-060) : code, pictogramme, titre, explication en français,
 * piste de correction et actions. Jamais de détail technique.
 */
export function ErrorState({
  code,
  tone = 'warn',
  icon,
  title,
  message,
  hint,
  actions,
}: {
  /** Code HTTP affiché en grand (404, 403, 500…) ; absent pour un état sans code. */
  code?: string
  tone?: 'warn' | 'ko' | 'info'
  icon: IconName
  title: string
  message: ReactNode
  hint?: ReactNode
  actions?: ReactNode
}) {
  const titleId = useId()
  return (
    <section className={`error-state error-state--${tone}`} aria-labelledby={titleId}>
      <div className="error-state__visual" aria-hidden="true">
        {code && <span className="error-state__code">{code}</span>}
        <span className="error-state__icon">
          <Icon name={icon} size={30} />
        </span>
      </div>
      {code && <p className="error-state__label">Erreur {code}</p>}
      <h1 id={titleId}>{title}</h1>
      <p className="error-state__message">{message}</p>
      {hint && <p className="error-state__hint">{hint}</p>}
      {actions && <div className="error-state__actions">{actions}</div>}
    </section>
  )
}
