import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../shared/api/client'
import { ApiError, toUserError } from '../../shared/api/errors'
import { useErrorModal } from '../../shared/ui/errorModalContext'
import { SelectField, TextAreaField, TextField } from '../../shared/ui/fields'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'

export interface EditField {
  name: string
  label: string
  type?: string
  required?: boolean
  min?: number
  max?: number
  maxLength?: number
  pattern?: string
  hint?: string
  options?: { value: string; label: string }[]
}

/** Formulaires d'administration : validation HTML, erreurs serveur, saisies conservées. */
export function EditDialog({
  title,
  path,
  method = 'post',
  fields,
  initial = {},
  onClose,
  transform = (v) => v,
}: {
  title: string
  path: string
  method?: 'post' | 'patch' | 'put' | 'delete'
  fields: EditField[]
  initial?: Record<string, string>
  transform?: (values: Record<string, string>) => unknown
  onClose: () => void
}) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const cache = useQueryClient()
  const { notify } = useToast()
  const { showError } = useErrorModal()
  function submit() {
    const found: Record<string, string[]> = {}
    for (const field of fields) {
      const value = values[field.name] ?? ''
      if (field.required && !value.trim())
        found[field.name] = [`${field.label} : champ obligatoire.`]
      else if (
        value &&
        field.type === 'number' &&
        (!Number.isSafeInteger(Number(value)) ||
          (field.min !== undefined && Number(value) < field.min) ||
          (field.max !== undefined && Number(value) > field.max))
      )
        found[field.name] = [
          `${field.label} : renseignez un entier entre ${field.min ?? 0} et ${field.max ?? 'la limite autorisée'}.`,
        ]
      else if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        found[field.name] = ['Renseignez une adresse e-mail valide.']
      else if (
        value &&
        field.type === 'password' &&
        field.name === 'password' &&
        (value.length < 10 || !/[a-zA-Z]/.test(value) || !/[0-9]/.test(value))
      )
        found[field.name] = [
          'Le mot de passe doit contenir au moins 10 caractères, des lettres et des chiffres.',
        ]
      else if (value && field.pattern && !new RegExp(`^(?:${field.pattern})$`).test(value))
        found[field.name] = [`${field.label} : format invalide.`]
      else if (field.maxLength && value.length > field.maxLength)
        found[field.name] = [`${field.label} : ${field.maxLength} caractères au maximum.`]
    }
    if (values.password && values.password !== values.password_confirmation)
      found.password_confirmation = ['Les mots de passe ne correspondent pas.']
    setErrors(found)
    if (Object.keys(found).length) {
      showError(new ApiError(422, 'Données invalides', 'Corrigez les champs signalés.', found))
      return
    }
    save.mutate()
  }
  const save = useMutation({
    mutationFn: () =>
      method === 'delete'
        ? api.delete(`/api/v1/${path}`)
        : api[method](`/api/v1/${path}`, transform(values)),
    onSuccess: () => {
      void cache.invalidateQueries()
      notify('Modification enregistrée')
      onClose()
    },
    onError: (error) => setErrors(toUserError(error).fieldErrors),
  })
  return (
    <Modal
      title={title}
      onClose={onClose}
      onSubmit={submit}
      submitting={save.isPending}
      submitLabel={method === 'delete' ? 'Confirmer le retrait' : 'Enregistrer'}
      submitIcon={method === 'post' ? 'plus' : method === 'delete' ? 'trash' : 'check'}
      danger={method === 'delete'}
    >
      <div className="fields">
        {fields.map((f) => {
          const props = {
            label: f.label,
            required: f.required,
            value: values[f.name] ?? '',
            onChange: (e: { target: { value: string } }) =>
              setValues({ ...values, [f.name]: e.target.value }),
            error: errors[f.name]?.[0],
            hint: f.hint,
          }
          return f.options ? (
            <SelectField key={f.name} {...props}>
              <option value="">Choisir…</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>
          ) : f.type === 'textarea' ? (
            <TextAreaField key={f.name} {...props} rows={3} maxLength={f.maxLength} />
          ) : (
            <TextField
              key={f.name}
              {...props}
              type={f.type ?? 'text'}
              min={f.min}
              max={f.max}
              maxLength={f.maxLength}
              pattern={f.pattern}
              autoComplete={f.type === 'password' ? 'new-password' : undefined}
            />
          )
        })}
      </div>
    </Modal>
  )
}
