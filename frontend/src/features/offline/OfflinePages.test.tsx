import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportUnreachable } from '../../shared/offline/connectivity'
import { saveQueryCache } from '../../shared/offline/persistence'
import { readSession, rememberSession } from '../../shared/offline/session'
import { storageSet } from '../../shared/offline/storage'
import { createBackup } from '../../shared/offline/backup'
import { readOutbox, writeOperations, type QueuedOperation } from '../../shared/offline/outbox'
import { appendRun, type SyncRun } from '../../shared/offline/syncLog'
import { cashier, EMPTY_DASHBOARD, mockApi, renderApp } from '../../test/renderApp'

const ACTIVITY_KEY = 'jb-hotel.last-activity'
const PAGE = { current_page: 1, last_page: 1, total: 0, per_page: 25 }
/** Chiffrement ou déchiffrement d’une sauvegarde (PBKDF2, 600 000 itérations) sous charge. */
const CRYPTO_WAIT = 15_000
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
    const row = (await within(history).findAllByRole('row'))[1]!
    expect(row).toHaveTextContent('Vers ce poste')
    expect(row).toHaveTextContent('Échec')
    expect(row).toHaveTextContent('Retour du réseau')
    expect(row).toHaveTextContent('Réservations : Connexion impossible')
    expect(screen.getByRole('region', { name: 'Mettre à jour en ligne' })).toHaveTextContent(
      '0 en attente',
    )
    expect(screen.getByRole('link', { name: /Synchronisation/ })).toHaveAttribute(
      'href',
      '/synchronisation',
    )
  })

  it('met à jour la copie locale et ajoute une ligne « Réussie » à l’historique', async () => {
    const calls = mockApi({
      'GET /api/v1/auth/me': { body: { data: USER } },
      'GET /api/v1/rooms': { body: { data: [] } },
      'GET /api/v1/room-rates/grid': { body: { data: [] } },
      'GET /api/v1/room-rates': { body: { data: [] } },
      'GET /api/v1/receivables': { body: { data: [], meta: PAGE } },
      'GET /api/v1/payments': { body: { data: [], meta: PAGE } },
      'GET /api/v1/reports/financial': { body: { data: { totals: {} } } },
      'GET /api/v1/report-agents': { body: { data: [] } },
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
      '/api/v1/room-rates/grid',
      '/api/v1/receivables',
      '/api/v1/payments',
      '/api/v1/reports/financial',
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
      screen.getByText(/sont celles gardées sur ce poste/).closest('.offline-banner'),
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
    await waitFor(() => expect(lock).toHaveTextContent(`mot de passe de ${USER.name}`))
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

  it('reste utilisable après un mois sans réseau, derrière le verrou (N-05 révisée)', async () => {
    await rememberSession(USER, 'Secret-2026')
    const session = await readSession()
    const monthAgo = Date.now() - 31 * 24 * 3_600_000
    await storageSet('offline-session', { ...session, lastOnlineAt: monthAgo })
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
    serve()
    await keepLocalCopy()
    goOffline()
    renderApp('/alertes')

    expect(await screen.findByText('Hors ligne')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: /Session hors ligne/ })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Session verrouillée' })).toBeNull()
  })

  it('bloque hors ligne un poste sans session gardée : le mot de passe ne peut être vérifié', async () => {
    serve()
    await keepLocalCopy()
    goOffline()
    renderApp('/alertes')

    const dialog = await screen.findByRole('dialog', { name: 'Session hors ligne indisponible' })
    expect(dialog).toHaveTextContent('Aucune session n’est gardée sur ce poste')
    expect(within(dialog).getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  })
})

/** Encaissement fait hors ligne il y a deux heures par la caissière connectée. */
function pendingPayment(overrides: Partial<QueuedOperation> = {}): QueuedOperation {
  return {
    id: '5f0c1d2e-0000-4000-8000-000000000001',
    kind: 'payment.record',
    label: 'Encaissement de 20 000 FCFA — chambre 101 · NGUEMA Paul',
    method: 'POST',
    path: '/api/v1/reservations/r-1/payments',
    body: { amount_fcfa: 20000, method: 'CASH' },
    createdAt: Date.now() - 2 * 3_600_000,
    userId: USER.id,
    userName: USER.name,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    error: null,
    provisionalNumber: 'LOC-CAISSE01-000001',
    definitiveNumber: null,
    localId: 'local-1',
    abandonReason: null,
    ...overrides,
  }
}

describe('Opérations en attente et sauvegardes (lot 4)', () => {
  it('signale au tableau de bord les opérations non confirmées et le rappel de sauvegarde', async () => {
    await writeOperations([
      pendingPayment(),
      pendingPayment({
        id: '5f0c1d2e-0000-4000-8000-000000000002',
        kind: 'reservation.check-in',
        label: 'Arrivée — chambre 102 · MBOLI Awa',
        status: 'rejected',
        provisionalNumber: null,
        error: { title: 'Conflit', message: 'La chambre est déjà occupée.', code: 'conflict' },
      }),
    ])
    mockApi({
      'GET /api/v1/auth/me': { body: { data: USER } },
      'GET /api/v1/dashboard': { body: EMPTY_DASHBOARD },
      'GET /api/v1/occupancy': { body: { at: '2026-12-01T10:00:00+01:00', data: [] } },
      'GET /api/v1/alerts': { body: { at: '2026-12-01T10:00:00+01:00', data: [], meta: PAGE } },
    })
    renderApp('/tableau-de-bord')

    const panel = await screen.findByRole('region', { name: 'Opérations faites hors ligne' })
    expect(panel).toHaveTextContent('1 en attente d’envoi')
    expect(panel).toHaveTextContent('1 refusée(s) à examiner')
    expect(panel).toHaveTextContent('20 000 FCFA encaissés hors ligne')
    expect(panel).toHaveTextContent('Encaissement de 20 000 FCFA — chambre 101 · NGUEMA Paul')
    expect(panel).toHaveTextContent('Cause : La chambre est déjà occupée.')
    // Attente de plus d’une heure sans sauvegarde : rappel avec le lien vers l’export.
    expect(
      within(panel).getByRole('link', { name: 'exportez une sauvegarde chiffrée' }),
    ).toHaveAttribute('href', '/synchronisation#sauvegarde')
    expect(screen.getByText(/en attente d’envoi\./).closest('.offline-banner')).toHaveTextContent(
      'Des opérations attendent depuis plus d’une heure',
    )
  })

  it('n’affiche rien au tableau de bord quand tout est envoyé', async () => {
    await writeOperations([pendingPayment({ status: 'accepted' })])
    mockApi({
      'GET /api/v1/auth/me': { body: { data: USER } },
      'GET /api/v1/dashboard': { body: EMPTY_DASHBOARD },
      'GET /api/v1/occupancy': { body: { at: '2026-12-01T10:00:00+01:00', data: [] } },
    })
    renderApp('/tableau-de-bord')

    expect(await screen.findByRole('heading', { name: 'Vue d’ensemble', level: 1 })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Opérations faites hors ligne' })).toBeNull()
  })

  it(
    'montre l’état du poste en repères et camemberts, puis exporte une sauvegarde chiffrée',
    { timeout: 30_000 },
    async () => {
      await writeOperations([pendingPayment()])
      const created = vi.fn((_blob: Blob) => 'blob:sauvegarde')
      Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() })
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      serve()
      renderApp('/synchronisation')
      const user = userEvent.setup()

      const tiles = await screen.findByRole('region', { name: 'Vue d’ensemble' })
      const tile = (label: string) => within(tiles).getByText(label).closest('article')!
      await waitFor(() => expect(tile('Opérations à envoyer')).toHaveTextContent('1'))
      await waitFor(() =>
        expect(tile('Dernière sauvegarde')).toHaveTextContent('Sauvegarde conseillée'),
      )
      const operations = screen.getByRole('figure', {
        name: 'Opérations faites hors ligne par état',
      })
      expect(within(operations).getByText('En attente').closest('li')).toHaveTextContent('1')
      // Les tests utilisent désormais IndexedDB et les mêmes transactions que le navigateur.
      expect(await screen.findByRole('region', { name: 'Stockage de ce poste' })).toHaveTextContent(
        'Copie automatique',
      )
      expect(
        await screen.findByRole('figure', {
          name: 'Données disponibles sur ce poste comparées au serveur',
        }),
      ).toBeVisible()
      expect(screen.getByRole('button', { name: 'Tout télécharger' })).toBeEnabled()

      await user.click(screen.getByRole('button', { name: 'Exporter une sauvegarde' }))
      const dialog = screen.getByRole('dialog', { name: 'Exporter une sauvegarde chiffrée' })
      await user.type(within(dialog).getByLabelText('Mot de passe de la sauvegarde'), 'Coffre-2026')
      await user.type(within(dialog).getByLabelText('Confirmer le mot de passe'), 'Autre-2026')
      await user.click(within(dialog).getByRole('button', { name: 'Exporter' }))
      expect(within(dialog).getByText('Les deux mots de passe diffèrent.')).toBeVisible()

      await user.clear(within(dialog).getByLabelText('Confirmer le mot de passe'))
      await user.type(within(dialog).getByLabelText('Confirmer le mot de passe'), 'Coffre-2026')
      await user.click(within(dialog).getByRole('button', { name: 'Exporter' }))
      // Chiffrement PBKDF2 (600 000 itérations) : lent sous la charge de la suite complète.
      expect(
        await screen.findByText(
          /Sauvegarde exportée : 1 opération\(s\), jb-hotel-sauvegarde-/,
          {},
          { timeout: CRYPTO_WAIT },
        ),
      ).toBeVisible()
      expect(click).toHaveBeenCalledOnce()
      const file = await (created.mock.calls[0]![0] as Blob).text()
      expect(file).toContain('"format":"jb-hotel-sauvegarde"')
      expect(file).not.toContain('NGUEMA')
      // L’opération est sauvegardée : le rappel cesse.
      await waitFor(() => expect(tile('Dernière sauvegarde')).toHaveTextContent('1 opération(s)'))
      click.mockRestore()
    },
  )

  it(
    'restaure une sauvegarde sur un autre poste sans créer de doublon',
    { timeout: 30_000 },
    async () => {
      await writeOperations([pendingPayment()])
      const { content } = await createBackup('Coffre-2026', 'Caisse 01')
      await writeOperations([])
      serve()
      renderApp('/synchronisation')
      const user = userEvent.setup()

      await user.click(await screen.findByRole('button', { name: 'Restaurer une sauvegarde' }))
      const dialog = screen.getByRole('dialog', { name: 'Restaurer une sauvegarde' })
      await user.upload(
        within(dialog).getByLabelText('Fichier de sauvegarde'),
        new File([content], 'jb-hotel-sauvegarde.json', { type: 'application/json' }),
      )
      await user.type(within(dialog).getByLabelText('Mot de passe de la sauvegarde'), 'mauvais-mdp')
      await user.click(within(dialog).getByRole('button', { name: 'Restaurer' }))
      expect(
        await within(dialog).findByText(
          'Mot de passe incorrect, ou fichier modifié depuis l’export.',
          {},
          { timeout: CRYPTO_WAIT },
        ),
      ).toBeVisible()

      await user.clear(within(dialog).getByLabelText('Mot de passe de la sauvegarde'))
      await user.type(within(dialog).getByLabelText('Mot de passe de la sauvegarde'), 'Coffre-2026')
      await user.click(within(dialog).getByRole('button', { name: 'Restaurer' }))
      expect(
        await screen.findByText(
          /restaurée : 1 opération\(s\) ajoutée\(s\)/,
          {},
          { timeout: CRYPTO_WAIT },
        ),
      ).toBeVisible()
      expect((await readOutbox()).map((o) => o.label)).toEqual([pendingPayment().label])
      const outbox = screen.getByRole('region', { name: 'Mettre à jour en ligne' })
      expect(await within(outbox).findByText(pendingPayment().label)).toBeVisible()
    },
  )
})
