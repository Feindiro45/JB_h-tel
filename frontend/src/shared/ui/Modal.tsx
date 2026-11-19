import { useId, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from './useFocusTrap'
import { Icon, type IconName } from './Icon'

export interface ModalProps {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  /** Si fourni, le contenu est un formulaire : Entrée ou le bouton principal le soumettent. */
  onSubmit?: () => void
  submitLabel?: string
  submitIcon?: IconName
  submitting?: boolean
  submitDisabled?: boolean
  danger?: boolean
  size?: 'small' | 'large'
}

/** Modale de saisie accessible (dialogue, focus piégé, Échap, retour du focus). */
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Enregistrer',
  submitIcon,
  submitting = false,
  submitDisabled = false,
  danger = false,
  size = 'large',
}: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const trapTab = useFocusTrap(dialogRef)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !submitting) {
      event.stopPropagation()
      onClose()
      return
    }
    trapTab(event)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!submitting && !submitDisabled) onSubmit?.()
  }

  const body = (
    <>
      <div className="dialog-body">{children}</div>
      <div className="dialog-foot">
        <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
          <Icon name="close" size={17} />
          {onSubmit ? 'Annuler' : 'Fermer'}
        </button>
        {onSubmit && (
          <button
            type="submit"
            className={danger ? 'danger' : 'primary'}
            disabled={submitting || submitDisabled}
          >
            <Icon
              name={submitting ? 'loader' : (submitIcon ?? (danger ? 'close' : 'check'))}
              size={18}
              className={submitting ? 'is-spinning' : undefined}
            />
            {submitting ? 'Enregistrement…' : submitLabel}
          </button>
        )}
      </div>
    </>
  )

  return createPortal(
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className={`modal${size === 'small' ? ' modal--small' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fermer"
            onClick={onClose}
            disabled={submitting}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {onSubmit ? (
          <form onSubmit={handleSubmit} noValidate>
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>,
    document.body,
  )
}
