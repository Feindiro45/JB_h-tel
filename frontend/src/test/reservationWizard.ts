import { waitFor, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { expect } from 'vitest'

type User = ReturnType<typeof userEvent.setup>
export type PaymentChoice = 'Paiement intégral' | 'Avance' | 'Paiement différé'

/** Passe à l'étape suivante de l'assistant « Nouvelle réservation » (D-071). */
export async function nextStep(user: User, dialog: HTMLElement): Promise<void> {
  const button = within(dialog).getByRole('button', { name: 'Suivant' })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

/**
 * Termine l'assistant depuis l'étape « Séjour et prix » une fois la chambre choisie : attend le
 * prix, fait confirmer le récapitulatif par le client, choisit le règlement (s'il est proposé)
 * puis crée la réservation.
 */
export async function finishReservationWizard(
  user: User,
  dialog: HTMLElement,
  payment: PaymentChoice = 'Paiement différé',
  advance?: string,
): Promise<void> {
  await within(dialog).findByText('Total net')
  await nextStep(user, dialog)
  await user.click(
    await within(dialog).findByLabelText('Le client a vérifié ces informations et les confirme'),
  )
  if (within(dialog).queryByRole('button', { name: 'Suivant' })) {
    await nextStep(user, dialog)
    await user.click(within(dialog).getByLabelText(payment))
    if (advance) {
      await user.type(within(dialog).getByLabelText('Montant de l’avance (FCFA)'), advance)
    }
  }
  await user.click(within(dialog).getByRole('button', { name: 'Créer la réservation' }))
}
