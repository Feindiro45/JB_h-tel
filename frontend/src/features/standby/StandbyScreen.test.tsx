import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberSession, verifyOfflinePassword } from '../../shared/offline/session'
import { isStandbyFlagged, STANDBY_KEY } from '../../shared/standby'
import { cashier, mockApi, renderApp, TEST_WORKSTATION } from '../../test/renderApp'

const ACTIVITY_KEY = 'jb-hotel.last-activity'
const USER = cashier()
const UNLOCKED = { timeout: 4000 }

function serve(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: USER } },
    'GET /api/v1/alerts': {
      body: {
        at: '2026-12-01T10:00:00+01:00',
        data: [],
        meta: { current_page: 1, last_page: 1, total: 0 },
      },
    },
    'POST /api/v1/auth/confirm-password': ({ body }) =>
      (body as { password: string }).password === 'Secret-2026'
        ? { status: 204 }
        : {
            status: 422,
            body: {
              title: 'Données invalides',
              message: 'Mot de passe incorrect.',
              errors: { password: ['Mot de passe incorrect.'] },
            },
          },
    ...extra,
  })
}

const standby = () => screen.findByRole('dialog', { name: 'Logiciel en veille' })

afterEach(() => {
  vi.useRealTimers()
})

describe('Page de veille (D-074)', () => {
  it('se met en veille après le délai sans action ; le serveur vérifie le mot de passe', async () => {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - 20 * 60_000))
    const calls = serve()
    renderApp('/alertes')
    const user = userEvent.setup()

    const lock = await standby()
    expect(within(lock).getByText(USER.name)).toBeVisible()
    expect(within(lock).getByText('Caissière')).toBeVisible()
    expect(lock).toHaveTextContent('Mise en veille après 15 min sans action')
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeVisible()
    expect(isStandbyFlagged()).toBe(true)

    await user.type(within(lock).getByLabelText('Mot de passe'), 'mauvais')
    await user.click(within(lock).getByRole('button', { name: 'Déverrouiller' }))
    expect(await within(lock).findByRole('alert')).toHaveTextContent('Mot de passe incorrect.')

    await user.clear(within(lock).getByLabelText('Mot de passe'))
    await user.type(within(lock).getByLabelText('Mot de passe'), 'Secret-2026')
    await user.click(within(lock).getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: 'Logiciel en veille' })).toBeNull(),
      UNLOCKED,
    )

    const checks = calls.filter((call) => call.path === '/api/v1/auth/confirm-password')
    expect(checks.map((call) => call.body)).toEqual([
      { password: 'mauvais' },
      { password: 'Secret-2026' },
    ])
    expect(isStandbyFlagged()).toBe(false)
    // L'empreinte du poste suit le mot de passe vérifié : la sortie de veille marche hors ligne.
    await waitFor(async () => expect(await verifyOfflinePassword('Secret-2026')).toBe(true))
  })

  it('« Verrouiller » met en veille tout de suite, et la veille résiste au rechargement', async () => {
    serve()
    renderApp('/alertes')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Verrouiller' }))
    expect(await standby()).toBeVisible()
    expect(localStorage.getItem(STANDBY_KEY)).not.toBeNull()

    // Page rechargée (ou autre onglet) : le logiciel s'ouvre toujours en veille.
    cleanup()
    serve()
    renderApp('/alertes')
    const lock = await standby()
    await user.type(within(lock).getByLabelText('Mot de passe'), 'Secret-2026')
    await user.click(within(lock).getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: 'Logiciel en veille' })).toBeNull(),
      UNLOCKED,
    )
  })

  it('montre ou masque le mot de passe, et refuse un champ vide sans appeler le serveur', async () => {
    const calls = serve()
    renderApp('/alertes')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Verrouiller' }))
    const lock = await standby()
    const field = within(lock).getByLabelText('Mot de passe')
    expect(field).toHaveAttribute('type', 'password')
    expect(field).toHaveFocus()
    await user.click(within(lock).getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(field).toHaveAttribute('type', 'text')
    await user.click(within(lock).getByRole('button', { name: 'Masquer le mot de passe' }))
    expect(field).toHaveAttribute('type', 'password')

    await user.click(within(lock).getByRole('button', { name: 'Déverrouiller' }))
    expect(within(lock).getByRole('alert')).toHaveTextContent('Saisissez votre mot de passe.')
    expect(calls.some((call) => call.path === '/api/v1/auth/confirm-password')).toBe(false)
  })

  it('serveur injoignable pendant la vérification : le poste vérifie avec son empreinte', async () => {
    await rememberSession(USER, 'Secret-2026')
    serve({
      'POST /api/v1/auth/confirm-password': {
        status: 503,
        body: { title: 'Indisponible', message: 'Service indisponible.' },
      },
    })
    renderApp('/alertes')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Verrouiller' }))
    const lock = await standby()
    await user.type(within(lock).getByLabelText('Mot de passe'), 'Secret-2026')
    await user.click(within(lock).getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: 'Logiciel en veille' })).toBeNull(),
      UNLOCKED,
    )
  })

  it('applique le délai réglé dans Paramètres (reçu avec les règles du poste)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - 6 * 60_000))
    const station = { ...TEST_WORKSTATION, offline_rules: { lock_after_minutes: 5 } }
    serve({
      'POST /api/v1/workstations/register': {
        status: 201,
        body: { data: station, token: 'jeton' },
      },
      'POST /api/v1/workstations/heartbeat': { body: { data: station } },
    })
    renderApp('/alertes')
    // Délai par défaut (15 min) tant que les règles du poste ne sont pas arrivées.
    expect(await screen.findByText('Poste 1')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Logiciel en veille' })).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(11_000)
    })
    const lock = await standby()
    expect(lock).toHaveTextContent('Mise en veille après 5 min sans action')
  })
})
