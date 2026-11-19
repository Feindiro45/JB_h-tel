import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toUserError } from '../../shared/api/errors'
import type { Customer } from '../../shared/api/types'
import { TextAreaField, TextField } from '../../shared/ui/fields'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { createCustomer, customerKeys, updateCustomer, type CustomerInput } from './api'
import {
  toCustomerForm,
  toCustomerInput,
  validateCustomer,
  type CustomerForm,
  type CustomerFormErrors,
} from './validation'

/** Création ou modification d'une fiche client (données minimales, D-021). */
export function CustomerFormDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer
  onClose: () => void
  onSaved?: (customer: Customer) => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [form, setForm] = useState<CustomerForm>(() => toCustomerForm(customer))
  const [errors, setErrors] = useState<CustomerFormErrors>({})

  const mutation = useMutation({
    mutationFn: (input: CustomerInput) =>
      customer ? updateCustomer(customer.id, input) : createCustomer(input),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.all })
      notify(customer ? 'Fiche client mise à jour' : 'Client enregistré')
      onSaved?.(saved)
      onClose()
    },
    onError: (error) => {
      // La modale globale explique l'erreur ; on met aussi en évidence les champs refusés.
      const fieldErrors = toUserError(error).fieldErrors
      setErrors(
        Object.fromEntries(
          Object.entries(fieldErrors).map(([key, messages]) => [key, messages[0]]),
        ),
      )
    },
  })

  const set = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  function submit() {
    const found = validateCustomer(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    mutation.mutate(toCustomerInput(form))
  }

  return (
    <Modal
      title={customer ? 'Modifier la fiche client' : 'Nouveau client'}
      subtitle="Ne collectez que les informations utiles au séjour."
      onClose={onClose}
      onSubmit={submit}
      submitLabel={customer ? 'Enregistrer les modifications' : 'Enregistrer le client'}
      submitting={mutation.isPending}
    >
      <div className="fields">
        <TextField
          label="Nom"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          required
          autoComplete="family-name"
        />
        <TextField
          label="Prénoms"
          value={form.first_name}
          onChange={(e) => set('first_name', e.target.value)}
          error={errors.first_name}
          autoComplete="given-name"
        />
        <TextField
          label="Téléphone"
          type="tel"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          error={errors.phone}
          required
          autoComplete="tel"
        />
        <TextField
          label="Adresse e-mail (facultative)"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
          hint="Sert à envoyer la confirmation, le reçu et la facture."
          autoComplete="email"
        />
        <TextField
          label="Ville de provenance"
          value={form.origin_city}
          onChange={(e) => set('origin_city', e.target.value)}
          error={errors.origin_city}
        />
        <TextField
          label="Pays de provenance"
          value={form.origin_country}
          onChange={(e) => set('origin_country', e.target.value)}
          error={errors.origin_country}
        />
        <TextField
          className="full"
          label="Adresse"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
          error={errors.address}
          autoComplete="street-address"
        />
        <TextField
          label="Pièce d’identité (si nécessaire)"
          placeholder="CNI, passeport…"
          value={form.identification_type}
          onChange={(e) => set('identification_type', e.target.value)}
          error={errors.identification_type}
        />
        <TextField
          label="Numéro de la pièce"
          value={form.identification_number}
          onChange={(e) => set('identification_number', e.target.value)}
          error={errors.identification_number}
        />
        <TextAreaField
          className="full"
          label="Notes internes"
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          error={errors.notes}
        />
        <label className="check full">
          <input
            type="checkbox"
            checked={form.email_notifications}
            onChange={(e) => set('email_notifications', e.target.checked)}
          />
          Le client accepte de recevoir les messages de séjour par e-mail
        </label>
      </div>
    </Modal>
  )
}
