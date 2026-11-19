import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { admin, cashier, mockApi, renderApp } from '../../test/renderApp'

const type = {
  id: '0190a000-0000-7000-8000-000000000010',
  code: 'VIP',
  label: 'VIP',
  description: null,
  rooms_count: 1,
}
const room = {
  id: '0190a000-0000-7000-8000-000000000011',
  number: '101',
  capacity: 2,
  room_type: type,
  maintenance_status: 'AVAILABLE',
  maintenance_label: 'Disponible',
  maintenance_note: null,
  notes: null,
}
const defaults = {
  'GET /api/v1/occupancy': { body: { at: '2026-11-19T10:00:00+01:00', data: [] } },
  'GET /api/v1/auth/me': { body: { data: admin() } },
  'GET /api/v1/rooms': { body: { data: [room] } },
  'GET /api/v1/room-types': { body: { data: [type] } },
}
describe('Administration', () => {
  it('affiche une chambre occupée en rouge et filtre son occupation calculée', async () => {
    mockApi({
      ...defaults,
      'GET /api/v1/occupancy': { body: { data: [{ room: { id: room.id }, state: 'OCCUPIED' }] } },
    })
    renderApp('/admin/chambres')
    const occupied = await screen.findByText('Occupée')
    expect(occupied).toHaveClass('badge--red')
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Occupation'), 'FREE')
    const panel = within(screen.getByRole('region', { name: 'Chambres' }))
    expect(panel.queryByText('101')).not.toBeInTheDocument()
    expect(panel.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent(
      'Aucun résultat',
    )
  })

  it('enregistre une maintenance avec une note et conserve le contrat de l’API', async () => {
    const calls = mockApi({
      ...defaults,
      [`PUT /api/v1/rooms/${room.id}/maintenance`]: { body: { data: room } },
    })
    renderApp('/admin/chambres')
    await screen.findByText('101')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Maintenance' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('État'), 'MAINTENANCE')
    await user.type(within(dialog).getByLabelText('Note de maintenance'), 'Climatisation à réparer')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
        status: 'MAINTENANCE',
        note: 'Climatisation à réparer',
      }),
    )
  })

  it('valide la capacité avant tout envoi et conserve la saisie', async () => {
    const calls = mockApi(defaults)
    renderApp('/admin/chambres')
    await screen.findByText('101')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '+ Chambre' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Numéro'), '202')
    await user.selectOptions(within(dialog).getByLabelText('Catégorie'), type.id)
    await user.clear(within(dialog).getByLabelText('Capacité'))
    await user.type(within(dialog).getByLabelText('Capacité'), '0')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Données invalides')
    expect(within(dialog).getByLabelText('Numéro')).toHaveValue('202')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('modifie une catégorie sans renvoyer son code, figé par le serveur', async () => {
    const calls = mockApi({
      ...defaults,
      [`PATCH /api/v1/room-types/${type.id}`]: { body: { data: { ...type, label: 'VIP Suite' } } },
    })
    renderApp('/admin/chambres')
    const categories = within(await screen.findByRole('region', { name: 'Catégories' }))
    const user = userEvent.setup()
    await user.click(await categories.findByRole('button', { name: 'Modifier' }))
    const dialog = screen.getByRole('dialog', { name: 'Catégorie VIP' })
    expect(within(dialog).queryByLabelText('Code')).not.toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('Libellé'))
    await user.type(within(dialog).getByLabelText('Libellé'), 'VIP Suite')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        label: 'VIP Suite',
        description: '',
      }),
    )
  })

  it('publie une nouvelle version tarifaire et affiche la grille', async () => {
    const calls = mockApi({
      ...defaults,
      'GET /api/v1/room-rates': { body: { data: [] } },
      'GET /api/v1/room-rates/grid': {
        body: { data: [{ room_type: type, rates: { DAY: { current: null, next: null } } }] },
      },
      'POST /api/v1/room-rates': { status: 201, body: { data: {} } },
    })
    renderApp('/admin/tarifs')
    await screen.findByText('Non défini')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Publier un tarif' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Catégorie'), type.id)
    await user.selectOptions(within(dialog).getByLabelText('Forfait'), 'DAY')
    await user.type(within(dialog).getByLabelText('Montant (FCFA)'), '60000')
    await user.type(within(dialog).getByLabelText('Motif'), 'Nouvelle grille')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        room_type_id: type.id,
        billing_unit: 'DAY',
        amount_fcfa: 60000,
        effective_from: null,
        reason: 'Nouvelle grille',
      }),
    )
  })

  it('désactive un utilisateur sans transmettre de mot de passe vide', async () => {
    const account = cashier()
    const calls = mockApi({
      ...defaults,
      'GET /api/v1/users': {
        body: { data: [account], meta: { total: 1, current_page: 1, last_page: 1 } },
      },
      'GET /api/v1/roles': { body: { data: [] } },
      [`PATCH /api/v1/users/${account.id}`]: { body: { data: account } },
    })
    renderApp('/admin/utilisateurs')
    await screen.findByText(account.email)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Compte'), 'false')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer' }),
    )
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        name: account.name,
        email: account.email,
        role: 'caissiere',
        active: false,
      }),
    )
  })

  it('signale les règles provisoires et ne permet de modifier que les paramètres réglables', async () => {
    mockApi({
      ...defaults,
      'GET /api/v1/settings': {
        body: {
          data: [
            {
              key: 'duration',
              label: 'Durée validée',
              value: 12,
              editable: false,
              status: 'VALIDATED',
              help: 'Jusqu’à 12 h',
              reference: 'D-007',
            },
            {
              key: 'discounts.cashier_max_percent',
              label: 'Plafond de remise',
              value: 10,
              type: 'integer',
              editable: true,
              status: 'PROVISIONAL',
              help: 'À confirmer',
              reference: 'D-016',
            },
          ],
        },
      },
    })
    renderApp('/admin/parametres')
    await screen.findByText('Provisoire')
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(1)
  })

  it('affiche le détail avant et après dans le journal d’audit', async () => {
    mockApi({
      ...defaults,
      'GET /api/v1/audit-actors': { body: { data: [] } },
      'GET /api/v1/audit-logs': {
        body: {
          data: [
            {
              id: 'uuid',
              label: 'Chambre modifiée',
              actor: { name: 'Directeur' },
              entity: { type: 'room', type_label: 'Chambre', id: room.id },
              occurred_at: '2026-12-01T10:00:00+01:00',
              before: { capacity: 2 },
              after: { capacity: 3 },
            },
          ],
          meta: { total: 1, current_page: 1, last_page: 1 },
          domains: [],
        },
      },
    })
    renderApp('/admin/audit')
    await userEvent.click(await screen.findByRole('button', { name: 'Détail' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('"capacity": 2')
    expect(dialog).toHaveTextContent('"capacity": 3')
  })

  it('refuse l’administration à la caissière', async () => {
    mockApi({ 'GET /api/v1/auth/me': { body: { data: cashier() } } })
    renderApp('/admin/chambres')
    expect(await screen.findByRole('heading', { name: 'Accès refusé' })).toBeInTheDocument()
  })
})
