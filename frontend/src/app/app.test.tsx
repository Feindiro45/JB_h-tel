import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { cashier, EMPTY_DASHBOARD, mockApi, renderApp } from '../test/renderApp'

const UNAUTHENTICATED = {
  status: 401,
  body: { title: 'Session expirée', message: 'Veuillez vous reconnecter.' },
}

describe('Connexion et navigation', () => {
  it('sans session, renvoie à la connexion puis à la page demandée après login', async () => {
    let loggedIn = false
    const calls = mockApi({
      'GET /api/v1/auth/me': () => (loggedIn ? { body: { data: cashier() } } : UNAUTHENTICATED),
      'GET /sanctum/csrf-cookie': { status: 204 },
      'POST /api/v1/auth/login': () => {
        loggedIn = true
        return { body: { data: cashier() } }
      },
      'GET /api/v1/customers': {
        body: { data: [], meta: { total: 0, current_page: 1, last_page: 1 } },
      },
    })
    const router = renderApp('/clients')

    expect(
      await screen.findByRole('heading', { name: 'Bienvenue à JB Hôtel.' }),
    ).toBeInTheDocument()
    // Le 401 de /auth/me est attendu : aucune modale d'erreur au démarrage.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Adresse e-mail'), 'caissiere@jbhotel.local')
    await user.type(screen.getByLabelText('Mot de passe'), 'secret-de-test')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/clients')
    // Cookie CSRF demandé avant l'envoi des identifiants (Sanctum, mode SPA).
    const order = calls.map((call) => `${call.method} ${call.path}`)
    expect(order.indexOf('GET /sanctum/csrf-cookie')).toBeLessThan(
      order.indexOf('POST /api/v1/auth/login'),
    )
  })

  it('filtre la barre latérale selon les permissions du serveur', async () => {
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'GET /api/v1/dashboard': { body: EMPTY_DASHBOARD },
      'GET /api/v1/occupancy': { body: { at: '2026-12-01T10:00:00+01:00', data: [] } },
    })
    const router = renderApp('/')

    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' })
    expect(within(nav).getByRole('link', { name: /Réservations/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Clients/ })).toBeInTheDocument()
    expect(
      within(nav).queryByRole('link', { name: /Utilisateurs et accès/ }),
    ).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /État du système/ })).not.toBeInTheDocument()
    // Accueil : première page autorisée.
    await waitFor(() => expect(router.state.location.pathname).toBe('/tableau-de-bord'))
  })

  it('refuse une page sans la permission correspondante', async () => {
    mockApi({ 'GET /api/v1/auth/me': { body: { data: cashier() } } })
    renderApp('/admin/etat')

    expect(await screen.findByRole('heading', { name: 'Accès refusé' })).toBeInTheDocument()
  })

  it('session expirée en cours de travail : modale puis retour à la connexion', async () => {
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'GET /api/v1/customers': UNAUTHENTICATED,
    })
    renderApp('/clients')

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Session expirée')).toBeInTheDocument()
    expect(await screen.findByLabelText('Adresse e-mail')).toBeInTheDocument()
  })
})
