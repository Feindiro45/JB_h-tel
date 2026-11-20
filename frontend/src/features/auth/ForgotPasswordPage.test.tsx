import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, renderApp } from '../../test/renderApp'

const ANONYMOUS = {
  'GET /api/v1/auth/me': { status: 401, body: { title: 'Session expirée', message: 'x' } },
  'GET /sanctum/csrf-cookie': { status: 204 },
}

describe('Mot de passe oublié (D-059)', () => {
  it('la connexion propose le lien « Mot de passe oublié ? »', async () => {
    mockApi(ANONYMOUS)
    const router = renderApp('/connexion')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: 'Mot de passe oublié ?' }))
    expect(await screen.findByRole('heading', { name: 'Mot de passe oublié' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/mot-de-passe-oublie')
  })

  it('envoie le lien au compte vérifié par le serveur et le confirme', async () => {
    const calls = mockApi({
      ...ANONYMOUS,
      'POST /api/v1/auth/forgot-password': {
        status: 202,
        body: {
          message:
            'Un e-mail contenant un lien de réinitialisation vient d’être envoyé à grace@hotel.cf. Ce lien est valable 60 minutes.',
        },
      },
    })
    renderApp('/mot-de-passe-oublie')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Envoyer le lien' }))
    expect(screen.getByText('Saisissez l’adresse e-mail de votre compte.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Adresse e-mail'), 'grace@hotel.cf')
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien' }))

    expect(await screen.findByText(/vient d’être envoyé à grace@hotel\.cf/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à la connexion' })).toHaveAttribute(
      'href',
      '/connexion',
    )
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ email: 'grace@hotel.cf' }),
    )
  })

  it('signale un compte introuvable sans rien envoyer', async () => {
    mockApi({
      ...ANONYMOUS,
      'POST /api/v1/auth/forgot-password': {
        status: 404,
        body: {
          title: 'Compte introuvable',
          message: 'Aucun compte du personnel ne correspond à cette adresse e-mail.',
          code: 'account_not_found',
        },
      },
    })
    renderApp('/mot-de-passe-oublie')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Adresse e-mail'), 'personne@hotel.cf')
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien' }))

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Compte introuvable')
    expect(screen.queryByText(/vient d’être envoyé/)).not.toBeInTheDocument()
  })

  it('le lien reçu choisit un nouveau mot de passe et signale la réinitialisation au serveur', async () => {
    const calls = mockApi({
      'GET /sanctum/csrf-cookie': { status: 204 },
      'POST /api/v1/auth/password': {
        body: { message: 'Mot de passe enregistré. Vous pouvez vous connecter.' },
      },
    })
    renderApp('/mot-de-passe?token=jeton&email=grace%40hotel.cf&motif=oubli')
    expect(await screen.findByRole('heading', { name: 'Nouveau mot de passe' })).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText('Nouveau mot de passe', { selector: 'input' }),
      'Nouveau2026x',
    )
    expect(screen.getByRole('list', { name: 'Règles du mot de passe' })).toHaveTextContent(
      'Au moins 10 caractères : respecté',
    )
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'Nouveau2026x')
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }))

    expect(
      await screen.findByRole('heading', { name: 'Mot de passe enregistré' }),
    ).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ purpose: 'reset' })
  })
})
