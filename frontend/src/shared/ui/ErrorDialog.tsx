import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export interface ErrorDialogProps {
  title: string
  message: string
  /** Détails de correction, par exemple les messages de validation des champs. */
  details?: string[]
  onClose: () => void
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modale d'erreur accessible : `role="alertdialog"`, focus piégé pendant l'ouverture,
 * fermeture par Échap ou par le bouton, retour du focus à l'élément d'origine.
 * Le reste de l'application est rendu inerte pendant l'ouverture ; les saisies sont conservées.
 */
export function ErrorDialog({ title, message, details = [], onClose }: ErrorDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const appRoot = document.getElementById('root')
    appRoot?.setAttribute('inert', '')
    closeButtonRef.current?.focus()
    return () => {
      appRoot?.removeAttribute('inert')
      previouslyFocused?.focus()
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal modal--error"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="modal__title">
          <svg className="modal__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M12 2 1 21h22L12 2Zm0 6 7.5 11h-15L12 8Zm-1 3v4h2v-4h-2Zm0 5v2h2v-2h-2Z"
            />
          </svg>
          {title}
        </h2>
        <div id={descriptionId} className="modal__body">
          <p>{message}</p>
          {details.length > 0 && (
            <ul className="modal__details">
              {details.map((detail, index) => (
                <li key={`${index}-${detail}`}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="modal__actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="button button--primary"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
