import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { admin, cashier, mockApi, renderApp, TEST_WORKSTATION } from '../../test/renderApp'
import type { WorkstationsOverview } from './api'

const TOKEN_KEY = 'jb-hotel.workstation-token'

function overview(overrides: Partial<WorkstationsOverview> = {}): WorkstationsOverview {
  return {
    main: {
      id: 'ws-1',
      name: 'CAISSE-01',
      last_seen_at: '2026-12-01T09:58:00+01:00',
      silent: false,
      assignment_number: 1,
      assigned_at: '2026-12-01T08:00:00+01:00',
      assigned_by: 'Directeur',
    },
    settings: { enforce_main_post: false, silent_after_minutes: 5 },
    workstations: [
      {
        id: 'ws-1',
        name: 'CAISSE-01',
        user_agent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
        registered_at: '2026-11-30T08:00:00+01:00',
        registered_by: 'Grâce',
        last_seen_at: '2026-12-01T09:58:00+01:00',
        last_seen_by: 'Grâce',
        silent: false,
        revoked_at: null,
        revocation_reason: null,
        is_main: true,
        is_current: false,
      },
      {
        id: 'ws-2',
        name: 'Poste 2',
        user_agent: 'Chrome Android',
        registered_at: '2026-12-01T07:00:00+01:00',
        registered_by: 'Directeur',
        last_seen_at: '2026-12-01T10:00:00+01:00',
        last_seen_by: 'Directeur',
        silent: false,
        revoked_at: null,
        revocation_reason: null,
        is_main: false,
        is_current: true,
      },
    ],
    assignments: [
      {
        id: 'as-1',
        number: 1,
        mode: 'FIRST',
        mode_label: 'Première désignation',
        workstation: 'CAISSE-01',
        previous_workstation: null,
        reason: null,
        previous_last_seen_at: null,
        assigned_by: 'Directeur',
        assigned_at: '2026-12-01T08:00:00+01:00',
      },
    ],
    ...overrides,
  }
}

function serve(data: WorkstationsOverview, extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: admin() } },
    'GET /api/v1/workstations': { body: { data } },
    ...extra,
  })
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('Postes de caisse (administration)', () => {
  it('présente le poste principal, les postes et l’historique numéroté', async () => {
    serve(overview())
    renderApp('/admin/postes')

    expect(await screen.findByRole('heading', { name: 'Postes de caisse', level: 1 })).toBeVisible()
    const list = await screen.findByRole('region', { name: 'Postes enregistrés' })
    const rows = within(list).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('CAISSE-01')
    expect(rows[1]).toHaveTextContent('Principal')
    expect(rows[1]).toHaveTextContent('Edge · Windows')
    expect(rows[1]).not.toHaveTextContent('Mozilla')
    expect(rows[2]).toHaveTextContent('Poste 2')
    expect(rows[2]).toHaveTextContent('Ce poste')
    // Règle inactive : le poste secondaire peut encore écrire.
    expect(rows[2]).toHaveTextContent('Actif')
    expect(rows[2]).not.toHaveTextContent('Consultation')
    // Le poste principal ne peut être ni redésigné ni révoqué.
    expect(within(rows[1]!).queryByRole('button', { name: /Révoquer/ })).toBeNull()
    expect(within(rows[2]!).getByRole('button', { name: 'Révoquer Poste 2' })).toBeVisible()
    const history = screen.getByRole('region', { name: 'Historique des désignations' })
    expect(history).toHaveTextContent('Première désignation')
    expect(screen.getByRole('link', { name: /Postes de caisse/ })).toHaveAttribute(
      'href',
      '/admin/postes',
    )
  })

  it('désigne un poste par transfert planifié quand le poste principal répond', async () => {
    const calls = serve(overview(), {
      'POST /api/v1/workstations/ws-2/designate': { body: { data: overview() } },
    })
    renderApp('/admin/postes')
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: 'Désigner Poste 2 comme poste principal' }),
    )
    const dialog = screen.getByRole('dialog', { name: /Désigner le poste principal/ })
    expect(dialog).toHaveTextContent('Transfert planifié')
    await user.type(within(dialog).getByLabelText('Motif (facultatif)'), 'Nouveau PC')
    await user.click(within(dialog).getByRole('button', { name: 'Désigner' }))

    await waitFor(() =>
      expect(calls.find((c) => c.path === '/api/v1/workstations/ws-2/designate')?.body).toEqual({
        reason: 'Nouveau PC',
      }),
    )
  })

  it('exige confirmation et motif pour un transfert forcé', async () => {
    const silent = overview({ main: { ...overview().main!, silent: true } })
    const calls = serve(silent, {
      'POST /api/v1/workstations/ws-2/designate': { body: { data: silent } },
    })
    renderApp('/admin/postes')
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: 'Désigner Poste 2 comme poste principal' }),
    )
    const dialog = screen.getByRole('dialog', { name: /Désigner le poste principal/ })
    expect(dialog).toHaveTextContent('ne donne plus signe de vie')
    const submit = within(dialog).getByRole('button', { name: 'Confirmer le transfert forcé' })
    expect(submit).toBeDisabled()
    await user.click(
      within(dialog).getByRole('checkbox', { name: /Je confirme le transfert forcé/ }),
    )
    await user.click(submit)
    expect(within(dialog).getByText(/Motif obligatoire/)).toBeVisible()
    expect(calls.some((c) => c.path.endsWith('/designate'))).toBe(false)

    await user.type(within(dialog).getByLabelText('Motif du transfert forcé'), 'PC en panne')
    await user.click(submit)
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith('/designate'))?.body).toEqual({
        reason: 'PC en panne',
        force: true,
      }),
    )
  })

  it('n’active la règle qu’avec un poste principal, par l’écran Paramètres', async () => {
    serve(overview({ main: null }))
    renderApp('/admin/postes')
    expect(await screen.findByRole('button', { name: 'Activer la règle' })).toBeDisabled()
  })

  it('active la règle du poste principal', async () => {
    const calls = serve(overview(), {
      'PUT /api/v1/settings/workstations.enforce_main_post': { body: { data: {} } },
    })
    renderApp('/admin/postes')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Activer la règle' }))
    const dialog = screen.getByRole('dialog', { name: /Activer la règle du poste principal/ })
    expect(dialog).toHaveTextContent('Seul « CAISSE-01 »')
    await user.click(within(dialog).getByRole('button', { name: 'Activer' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ value: true }),
    )
  })
})

describe('Pastille du poste dans la barre du haut', () => {
  it('enregistre ce navigateur au premier passage et garde son jeton', async () => {
    const calls = mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'POST /api/v1/workstations/register': {
        status: 201,
        body: { data: { ...TEST_WORKSTATION, name: 'Poste 7' }, token: 'jeton-poste-7' },
      },
    })
    renderApp('/alertes')

    expect(await screen.findByText('Poste 7')).toBeVisible()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jeton-poste-7')
    expect(calls.filter((c) => c.path === '/api/v1/workstations/register')).toHaveLength(1)
  })

  it('signale sa présence avec le jeton et indique le rôle de consultation', async () => {
    localStorage.setItem(TOKEN_KEY, 'jeton-existant')
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'POST /api/v1/workstations/heartbeat': {
        body: {
          data: {
            ...TEST_WORKSTATION,
            name: 'Poste 2',
            enforce_main_post: true,
            main: { name: 'CAISSE-01', silent: false },
          },
        },
      },
    })
    const fetchSpy = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    renderApp('/alertes')

    const chip = await screen.findByText('Poste 2')
    expect(chip).toHaveTextContent('Poste 2 · consultation')
    expect(chip).toHaveAttribute('title', expect.stringContaining('« CAISSE-01 »'))
    const heartbeat = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/heartbeat'))
    if (!heartbeat) throw new Error('Signal de présence non envoyé')
    expect((heartbeat[1].headers as Record<string, string>)['X-Workstation-Token']).toBe(
      'jeton-existant',
    )
  })

  it('se réenregistre si le serveur ne connaît plus le jeton', async () => {
    localStorage.setItem(TOKEN_KEY, 'jeton-perime')
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'POST /api/v1/workstations/heartbeat': {
        status: 404,
        body: { title: 'Poste inconnu', message: 'Inconnu.', code: 'workstation_unknown' },
      },
      'POST /api/v1/workstations/register': {
        status: 201,
        body: { data: { ...TEST_WORKSTATION, name: 'Poste 9' }, token: 'jeton-neuf' },
      },
    })
    renderApp('/alertes')

    expect(await screen.findByText('Poste 9')).toBeVisible()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jeton-neuf')
    // Le 404 du poste inconnu est rattrapé : jamais affiché à l’utilisateur.
    expect(screen.queryByText(/Poste inconnu/)).toBeNull()
  })
})
