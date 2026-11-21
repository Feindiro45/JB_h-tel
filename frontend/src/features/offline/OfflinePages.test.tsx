import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportUnreachable } from '../../shared/offline/connectivity'
import { saveQueryCache } from '../../shared/offline/persistence'
import { readSession, rememberSession } from '../../shared/offline/session'
import { storageSet } from '../../shared/offline/storage'
import { appendRun, type SyncRun } from '../../shared/offline/syncLog'
import { cashier, EMPTY_DASHBOARD, mockApi, renderApp } from '../../test/renderApp'

const ACTIVITY_KEY = 'jb-hotel.last-activity'
const PAGE = { current_page: 1, last_page: 1, total: 0, per_page: 25 }
const USER = cashier()

function serve() {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: USER } },
    'GET /api/v1/alerts': {
      body: {
        at: '2026-12-01T10:00:00+01:00',
        data: [],
        meta: { current_page: 1, last_page: 1, total: 0 },
      },
    },
  })
}

function run(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 'run-1',
    direction: 'local',
    trigger: 'reconnect',
    startedAt: new Date('2026-12-01T08:00:00+01:00').getTime(),
    finishedAt: new Date('2026-12-01T08:00:02+01:00').getTime(),
    status: 'failure',
    datasets: 0,
    records: 0,
    skipped: 0,
    bytes: null,
    failures: [
      { dataset: 'Réservations', cause: 'Connexion impossible. Vérifiez votre connexion.' },
    ],
    user: 'Grâce',
    ...overrides,
  }
}

/** Coupure réelle : le serveur ne répond plus du tout. */
function goOffline() {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
  reportUnreachable()
}

/** Copie locale d’un poste déjà utilisé en ligne : la session y figure. */
async function keepLocalCopy() {
  const client = new QueryClient()
  client.setQueryData(['auth', 'me'], USER)
  await saveQueryCache(client)
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('Synchronisation et sauvegardes', () => {
  it('présente l’historique avec le résultat et la cause de chaque échec', async () => {
    await appendRun(run())
    serve()
    renderApp('/synchronisation')

    expect(
      await screen.findByRole('heading', { name: 'Synchronisation et sauvegardes', level: 1 }),
    ).toBeVisible()
    const history = await screen.findByRole('region', { name: 'Historique des synchronisations' })
    const row = within(history).getAllByRole('row')[1]!
    expect(row).toHaveTextContent('Vers ce poste')
    expect(row).toHaveTextContent('Échec')
    expect(row).toHaveTextContent('Retour du réseau')
    expect(row).toHaveTextContent('Réservations : Connexion impossible')
    expect(
      screen.getByRole('region', { name: 'Mettre à jour en ligne et exporter' }),
    ).toHaveTextContent('0 opération en attente')
    expect(screen.getByRole('link', { name: /Synchronisation/ })).toHaveAttribute(
      'href',
      '/synchronisation',
    )
  })

  it('met à jour la copie locale et ajoute une ligne « Réussie » à l’historique', async () => {
    const calls = mockApi({
      'GET /api/v1/auth/me': { body: { data: USER } },
      'GET /api/v1/rooms': { body: { data: [] } },
      'GET /api/v1/dashboard': { body: EMPTY_DASHBOARD },
      'GET /api/v1/occupancy': { body: { at: '2026-12-01T10:00:00+01:00', data: [] } },
      'GET /api/v1/planning': {
        body: { from: '2026-12-01', days: [], labels: {}, data: [] },
      },
      'GET /api/v1/reservations': { body: { data: [], meta: PAGE } },
      'GET /api/v1/alerts': { body: { at: '2026-12-01T10:00:00+01:00', data: [], meta: PAGE } },
      'GET /api/v1/customers': { body: { data: [], meta: PAGE } },
      'GET /api/v1/invoices': {
        body: {
          data: [],
          meta: PAGE,
          totals: { invoices_fcfa: 0, credit_notes_fcfa: 0, net_invoiced_fcfa: 0, count: 0 },
        },
      },
      'GET /api/v1/cash-journal': {
        body: {
          data: {
            from: '2026-12-01',
            to: '2026-12-01',
            totals: {},
            by_method: [],
            by_agent: [],
            movements: [],
          },
        },
      },
    })
    renderApp('/synchronisation')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Mettre à jour en local' }))
    expect(await screen.findByText(/Copie locale à jour/)).toBeVisible()
    const history = screen.getByRole('region', { name: 'Historique des synchronisations' })
    await waitFor(() => expect(within(history).getAllByRole('row')).toHaveLength(2))
    const row = within(history).getAllByRole('row')[1]!
    expect(row).toHaveTextContent('Réussie')
    expect(row).toHaveTextContent('Manuelle')
    expect(row).toHaveTextContent(USER.name)
    expect(calls.filter((c) => c.path === '/api/v1/auth/me').length).toBeGreaterThanOrEqual(2)
    // Écrans essentiels téléchargés même s’ils n’ont jamais été ouverts sur ce poste.
    const paths = calls.map((c) => c.path)
    for (const path of [
      '/api/v1/rooms',
      '/api/v1/dashboard',
      '/api/v1/occupancy',
      '/api/v1/planning',
    ])
      expect(paths).toContain(path)
  })
})

describe('Consultation hors ligne', () => {
  it('signale la coupure par une pastille et un bandeau', async () => {
    serve()
    renderApp('/alertes')
    await screen.findByText('En ligne')

    goOffline()
    expect(await screen.findByText('Hors ligne')).toBeVisible()
    expect(
      screen.getByText(/Vous consultez les données gardées/).closest('.offline-banner'),
    ).toHaveAttribute('role', 'status')
  })

  it('verrouille après 15 min d’inactivité hors ligne et redemande le mot de passe', async () => {
    await rememberSession(USER, 'Secret-2026')
    localStorage.setItem(ACTIVITY_KEY, String(Date.now() - 20 * 60_000))
    serve()
    await keepLocalCopy()
    goOffline()
    renderApp('/alertes')
    const user = userEvent.setup()

    const lock = await screen.findByRole('dialog', { name: 'Session verrouillée' })
    expect(lock).toHaveTextContent(`mot de passe de ${USER.name}`)
    await user.type(within(lock).getByLabelText('Mot de passe'), 'mauvais')
    await user.click(within(lock).getByRole('button', { name: 'Déverrouiller' }))
    expect(await within(lock).findByText('Mot de passe incorrect.')).toBeVisible()

    await user.clear(within(lock).getByLabelText('Mot de passe'))
    await user.type(within(lock).getByLabelText('Mot de passe'), 'Secret-2026')
    await user.click(within(lock).getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Session verrouillée' })).toBeNull(),
    )
  })

  it('refuse l’accès hors ligne au-delà de 12 h sans connexion au serveur', async () => {
    await rememberSession(USER, 'Secret-2026')
    const session = await readSession()
    await storageSet('offline-session', { ...session, lastOnlineAt: Date.now() - 13 * 3_600_000 })
    serve()
    await keepLocalCopy()
    goOffline()
    renderApp('/alertes')

    const dialog = await screen.findByRole('dialog', { name: 'Session hors ligne expirée' })
    expect(dialog).toHaveTextContent('Plus de 12 h sans connexion')
    expect(within(dialog).getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  })
})
