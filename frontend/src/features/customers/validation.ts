import type { Customer } from '../../shared/api/types'
import type { CustomerInput } from './api'

/** Saisie du formulaire client : texte brut, converti en `CustomerInput` à l'envoi. */
export type CustomerForm = Required<{
  [K in keyof CustomerInput]: K extends 'email_notifications' ? boolean : string
}>

export type CustomerFormErrors = Partial<Record<keyof CustomerForm, string>>

export function toCustomerForm(customer?: Customer): CustomerForm {
  return {
    name: customer?.name ?? '',
    first_name: customer?.first_name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    origin_city: customer?.origin_city ?? '',
    origin_country: customer?.origin_country ?? '',
    address: customer?.address ?? '',
    identification_type: customer?.identification_type ?? '',
    identification_number: customer?.identification_number ?? '',
    notes: customer?.notes ?? '',
    email_notifications: customer?.email_notifications ?? true,
  }
}

/** Validation de confort ; le serveur reste l'autorité (règles de CustomerRequest). */
export function validateCustomer(form: CustomerForm): CustomerFormErrors {
  const errors: CustomerFormErrors = {}
  if (!form.name.trim()) errors.name = 'Le nom est obligatoire.'
  if (!form.phone.trim()) errors.phone = 'Le téléphone est obligatoire.'
  else if (!/^\+?[0-9 ().-]{6,40}$/.test(form.phone.trim()))
    errors.phone = 'Le numéro ne peut contenir que des chiffres, des espaces et « + ( ) . - ».'
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    errors.email = 'Adresse e-mail invalide.'
  if (form.identification_type.trim() && !form.identification_number.trim())
    errors.identification_number = 'Indiquez le numéro de la pièce.'
  if (form.identification_number.trim() && !form.identification_type.trim())
    errors.identification_type = 'Indiquez le type de pièce.'
  return errors
}

/** Champs vides envoyés à `null` (le serveur efface la valeur), texte nettoyé. */
export function toCustomerInput(form: CustomerForm): CustomerInput {
  const clean = (value: string) => value.trim() || null
  return {
    name: form.name.trim(),
    first_name: clean(form.first_name),
    phone: form.phone.trim(),
    email: clean(form.email),
    origin_city: clean(form.origin_city),
    origin_country: clean(form.origin_country),
    address: clean(form.address),
    identification_type: clean(form.identification_type),
    identification_number: clean(form.identification_number),
    notes: clean(form.notes),
    email_notifications: form.email_notifications,
  }
}
