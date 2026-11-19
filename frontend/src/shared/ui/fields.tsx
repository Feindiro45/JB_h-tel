import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Icon, type IconName } from './Icon'

interface FieldChrome {
  label: string
  error?: string
  hint?: string
  className?: string
  icon?: IconName
}

/** Icônes sémantiques communes ; un formulaire peut préciser une icône plus spécifique. */
function fieldIcon(label: string, type?: string): IconName {
  const text = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (type === 'search' || /recherch/.test(text)) return 'search'
  if (type === 'password' || /mot de passe/.test(text)) return 'key'
  if (type === 'email' || /e.?mail/.test(text)) return 'mail'
  if (type === 'tel' || /telephon/.test(text)) return 'phone'
  if (type === 'date' || /date|^du$|^au$|jour|periode/.test(text)) return 'calendar'
  if (type === 'time' || /heure|duree/.test(text)) return 'clock'
  if (/pays/.test(text)) return 'globe'
  if (/ville|adresse|provenance/.test(text)) return 'pin'
  if (/remise|pourcent|plafond/.test(text)) return 'percent'
  if (/montant|prix|tarif|avance|solde|paiement|reglement/.test(text)) return 'cash'
  if (/chambre/.test(text)) return 'rooms'
  if (/categorie|forfait|type/.test(text)) return 'layers'
  if (/role|permission/.test(text)) return 'shield'
  if (/nom|prenom|client|titulaire|occupant|agent|auteur|capacite/.test(text)) return 'people'
  if (/numero|reference|quantite|piece/.test(text) || type === 'number') return 'hash'
  if (/statut|etat|compte/.test(text)) return 'check'
  if (/motif|note|commentaire/.test(text)) return 'document'
  return type === 'select' ? 'filter' : 'edit'
}

/**
 * Associe libellé, aide et message d'erreur au champ (aria-describedby, aria-invalid).
 * L'aide et l'erreur restent hors du <label> : elles décrivent le champ sans allonger son nom.
 */
function useFieldIds(error?: string, hint?: string) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return { id, errorId, hintId, describedBy }
}

function Messages({
  error,
  hint,
  errorId,
  hintId,
}: {
  error?: string
  hint?: string
  errorId: string
  hintId: string
}) {
  return (
    <>
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </>
  )
}

export function TextField({
  label,
  error,
  hint,
  className,
  icon,
  ...input
}: FieldChrome & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(error, hint)
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={ids.id}>{label}</label>
      <div className="field-control field-control--icon">
        <Icon name={icon ?? fieldIcon(label, input.type)} size={19} />
        <input
          id={ids.id}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          {...input}
        />
      </div>
      <Messages error={error} hint={hint} errorId={ids.errorId} hintId={ids.hintId} />
    </div>
  )
}

export function SelectField({
  label,
  error,
  hint,
  className,
  icon,
  children,
  ...select
}: FieldChrome & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const ids = useFieldIds(error, hint)
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={ids.id}>{label}</label>
      <div className="field-control field-control--icon">
        <Icon name={icon ?? fieldIcon(label, 'select')} size={19} />
        <select
          id={ids.id}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          {...select}
        >
          {children}
        </select>
      </div>
      <Messages error={error} hint={hint} errorId={ids.errorId} hintId={ids.hintId} />
    </div>
  )
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  icon,
  ...area
}: FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useFieldIds(error, hint)
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={ids.id}>{label}</label>
      <div className="field-control field-control--icon field-control--area">
        <Icon name={icon ?? fieldIcon(label)} size={19} />
        <textarea
          id={ids.id}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
          {...area}
        />
      </div>
      <Messages error={error} hint={hint} errorId={ids.errorId} hintId={ids.hintId} />
    </div>
  )
}
