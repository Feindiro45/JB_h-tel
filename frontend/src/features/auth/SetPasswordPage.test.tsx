import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, renderApp } from '../../test/renderApp'

const LINK = '/mot-de-passe?token=jeton-de-test&email=nadia%40hotel.cf'

describe('Choisir son mot de passe depuis l’invitation', () => {
  it('enregistre le mot de passe avec le jeton du lien puis propose la connexion', async () => {
    const calls = mockApi({
      'GET /sanctum/csrf-cookie': { status: 204 },
      'POST /api/v1/auth/password': {
        body: { message: 'Mot de passe enregistré. Vous pouvez vous connecter.' },
      },
    })
    renderApp(LINK)
    expect(await screen.findByText('nadia@hotel.cf')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'court')
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'autre')
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }))
    expect(
      screen.getByText('Au moins 10 caractères, avec des lettres et des chiffres.', {
        selector: '.field-error, [id$="-error"]',
      }),
    ).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.clear(screen.getByLabelText('Nouveau mot de passe'))
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'Choisi2026x')
    await user.clear(screen.getByLabelText('Confirmer le mot de passe'))
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Choisi2026x')
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }))

    expect(
      await screen.findByText('Mot de passe enregistré. Vous pouvez vous connecter.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion')
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        email: 'nadia@hotel.cf',
        token: 'jeton-de-test',
        password: 'Choisi2026x',
        password_confirmation: 'Choisi2026x',
      }),
    )
  })

  it('explique un lien expiré dans la fenêtre d’erreur', async () => {
    mockApi({
      'GET /sanctum/csrf-cookie': { status: 204 },
      'POST /api/v1/auth/password': {
        status: 422,
        body: {
          title: 'Lien expiré',
          message: 'Ce lien n’est plus valable : il a expiré ou a déjà servi.',
          code: 'invitation_invalid',
        },
      },
    })
    renderApp(LINK)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Nouveau mot de passe'), 'Choisi2026x')
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Choisi2026x')
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Lien expiré')
  })

  it('signale un lien incomplet', async () => {
    mockApi({})
    renderApp('/mot-de-passe')
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce lien est incomplet')
  })
})
