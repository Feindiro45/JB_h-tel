import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

interface FieldChrome {
  label: string
  error?: string
  hint?: string
  className?: string
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
  ...input
}: FieldChrome & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(error, hint)
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={ids.id}>{label}</label>
      <input
        id={ids.id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...input}
      />
      <Messages error={error} hint={hint} errorId={ids.errorId} hintId={ids.hintId} />
    </div>
  )
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ...select
}: FieldChrome & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const ids = useFieldIds(error, hint)
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={ids.id}>{label}</label>
      <select
        id={ids.id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...select}
      >
        {children}
      </select>
      <Messages error={error} hint={hint} errorId={ids.errorId} hintId={ids.hintId} />
    </div>
  )
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  ...area
}: FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useFieldIds(error, hint)
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={ids.id}>{label}</label>
      <textarea
        id={ids.id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...area}
      />
      <Messages error={error} hint={hint} errorId={ids.errorId} hintId={ids.hintId} />
    </div>
  )
}
