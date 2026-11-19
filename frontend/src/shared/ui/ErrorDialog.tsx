import { useId, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from './useFocusTrap'

export interface ErrorDialogProps {
  title: string
  message: string
  /** Détails de correction, par exemple les messages de validation des champs. */
  details?: string[]
  onClose: () => void
}

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
  const trapTab = useFocusTrap(dialogRef, closeButtonRef)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    trapTab(event)
  }

  return createPortal(
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal modal--small modal--error"
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
          <button ref={closeButtonRef} type="button" className="primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
