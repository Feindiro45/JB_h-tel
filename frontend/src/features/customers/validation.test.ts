import { describe, expect, it } from 'vitest'
import { toCustomerForm, toCustomerInput, validateCustomer } from './validation'

describe('validation client', () => {
  it('exige le nom et le téléphone', () => {
    const errors = validateCustomer(toCustomerForm())
    expect(errors.name).toBe('Le nom est obligatoire.')
    expect(errors.phone).toBe('Le téléphone est obligatoire.')
  })

  it('refuse un téléphone ou un e-mail mal formé', () => {
    const errors = validateCustomer({
      ...toCustomerForm(),
      name: 'NGUEMA',
      phone: 'abc',
      email: 'pas-un-mail',
    })
    expect(errors.phone).toMatch(/chiffres/)
    expect(errors.email).toBe('Adresse e-mail invalide.')
  })

  it('exige le type et le numéro de pièce ensemble', () => {
    const base = { ...toCustomerForm(), name: 'NGUEMA', phone: '+236 70 00 00 00' }
    expect(
      validateCustomer({ ...base, identification_type: 'CNI' }).identification_number,
    ).toBeDefined()
    expect(
      validateCustomer({ ...base, identification_number: '123' }).identification_type,
    ).toBeDefined()
    expect(
      validateCustomer({ ...base, identification_type: 'CNI', identification_number: '123' }),
    ).toEqual({})
  })

  it('envoie les champs vides à null et nettoie les espaces', () => {
    const input = toCustomerInput({
      ...toCustomerForm(),
      name: '  Nguema ',
      phone: ' +236 70 00 00 00 ',
      email: '   ',
    })
    expect(input.name).toBe('Nguema')
    expect(input.phone).toBe('+236 70 00 00 00')
    expect(input.email).toBeNull()
    expect(input.email_notifications).toBe(true)
  })
})
