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
const MAIL = {
  mailer: 'smtp',
  transport: 'smtp',
  delivers: true,
  host: 'mail.banguiweb-tech.com',
  port: 465,
  scheme: 'smtps',
  authenticated: true,
  from_address: 'jb@banguiweb-tech.com',
  from_name: 'JB Hôtel',
  queue: { connection: 'database', needs_worker: true, pending: 2, failed: 0 },
}
const defaults = {
  'GET /api/v1/settings/mail': { body: { data: MAIL } },
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
    await user.click(screen.getByRole('button', { name: `Modifier ${account.name}` }))
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
    const rule = await screen.findByRole('article', { name: 'Plafond de remise' })
    expect(rule).toHaveTextContent('Provisoire')
    expect(rule).toHaveTextContent('Réf. D-016')
    expect(screen.getByRole('article', { name: 'Durée validée' })).toHaveTextContent(
      'Fixé par décision',
    )
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(1)
  })

  it('range les paramètres par domaine, avec recherche et filtre « Afficher »', async () => {
    mockApi({
      ...defaults,
      'GET /api/v1/settings': {
        body: {
          data: [
            {
              key: 'discounts.cashier_max_percent',
              label: 'Plafond de remise',
              value: 10,
              unit: '%',
              type: 'integer',
              editable: true,
              status: 'PROVISIONAL',
              help: 'Au-delà, droit de dépasser le plafond.',
              reference: 'D-016',
            },
            {
              key: 'billing.half_day_max_hours',
              label: 'Durée maximale du forfait demi-journée',
              value: 12,
              unit: 'h',
              type: 'integer',
              editable: false,
              status: 'VALIDATED',
              help: 'Jusqu’à 12 h incluses.',
              reference: 'D-007',
            },
            {
              key: 'offline.allowed_operations',
              label: 'Opérations permises sans Internet',
              value: ['payment.record', 'checkin'],
              options: { 'payment.record': 'Encaissement', checkin: 'Arrivée' },
              type: 'choices',
              editable: true,
              status: 'PROVISIONAL',
              help: 'Les autres sont refusées hors ligne.',
              reference: 'D-064',
            },
          ],
        },
      },
    })
    renderApp('/admin/parametres')
    const user = userEvent.setup()

    await screen.findByRole('article', { name: 'Plafond de remise' })
    const nav = screen.getByRole('navigation', { name: 'Domaines des paramètres' })
    expect(
      within(nav).getByRole('link', { name: 'Remises : 1 règle, dont 1 à valider' }),
    ).toHaveAttribute('href', '#parametres-discounts')
    expect(
      within(nav).getByRole('link', { name: 'Facturation et caisse : 1 règle' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Hors ligne' })).toHaveTextContent(
      'EncaissementArrivée',
    )
    expect(screen.getByRole('article', { name: 'Plafond de remise' })).toHaveTextContent('10 %')

    await user.type(screen.getByLabelText('Rechercher une règle'), 'd-007')
    expect(screen.getAllByRole('article', { name: /.+/ })).toHaveLength(1)
    expect(screen.getByRole('article', { name: /demi-journée/ })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Rechercher une règle'))
    await user.selectOptions(screen.getByLabelText('Afficher'), 'PROVISIONAL')
    expect(screen.queryByRole('article', { name: /demi-journée/ })).toBeNull()
    expect(screen.getAllByRole('article', { name: /.+/ })).toHaveLength(2)

    await user.type(screen.getByLabelText('Rechercher une règle'), 'introuvable')
    expect(screen.getByText('Aucune règle ne correspond')).toBeInTheDocument()
  })

  it('modifie les informations de l’établissement imprimées sur les factures (D-073)', async () => {
    const setting = (key: string, label: string, value: string | null) => ({
      key,
      label,
      value,
      type: 'text',
      editable: true,
      status: 'VALIDATED',
      help: 'Imprimé sur les factures et reçus.',
      reference: 'D-073',
    })
    const calls = mockApi({
      ...defaults,
      'GET /api/v1/settings': {
        body: {
          data: [
            setting('hotel.city', 'Ville', 'Bambari, République centrafricaine'),
            setting('hotel.email', 'E-mail de l’hôtel', 'reception@jb-hotel.com'),
            setting('hotel.phone', 'Téléphone de l’hôtel', null),
          ],
        },
      },
      'PUT /api/v1/settings/hotel.email': { body: { data: { key: 'hotel.email', value: null } } },
    })
    renderApp('/admin/parametres')
    const user = userEvent.setup()

    const group = await screen.findByRole('region', { name: 'Établissement' })
    expect(within(group).getByRole('article', { name: 'Ville' })).toHaveTextContent(
      'Bambari, République centrafricaine',
    )
    expect(within(group).getByRole('article', { name: 'Téléphone de l’hôtel' })).toHaveTextContent(
      'Non imprimé',
    )

    await user.click(
      within(within(group).getByRole('article', { name: 'E-mail de l’hôtel' })).getByRole(
        'button',
        { name: 'Modifier' },
      ),
    )
    const dialog = screen.getByRole('dialog', { name: 'E-mail de l’hôtel' })
    const field = within(dialog).getByLabelText('E-mail de l’hôtel')
    expect(field).toHaveAttribute('type', 'email')
    expect(field).not.toBeRequired()
    await user.clear(field)
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    // Une information facultative vidée n'est plus imprimée : la valeur envoyée est « null ».
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ value: null }),
    )
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
  it('envoie un e-mail de test et décrit l’envoi sans aucun secret', async () => {
    const calls = mockApi({
      ...defaults,
      'GET /api/v1/settings': { body: { data: [] } },
      'POST /api/v1/settings/mail/test': {
        body: { message: 'E-mail de test envoyé à reception@hotel.cf.', data: MAIL },
      },
    })
    renderApp('/admin/parametres')
    const panel = await screen.findByRole('region', { name: 'Envoi des e-mails' })
    expect(await within(panel).findByText('Envoi réel')).toBeInTheDocument()
    expect(panel).toHaveTextContent('mail.banguiweb-tech.com:465 · smtps · authentifié')
    expect(panel).toHaveTextContent('2 en attente · 0 en échec')
    expect(within(panel).getByRole('status')).toHaveTextContent('php artisan queue:work')
    const user = userEvent.setup()
    const address = within(panel).getByLabelText('Adresse de test')
    await user.clear(address)
    await user.type(address, 'reception@hotel.cf')
    await user.click(within(panel).getByRole('button', { name: 'Envoyer un e-mail de test' }))
    expect(
      await screen.findByText('E-mail de test envoyé à reception@hotel.cf.'),
    ).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ to: 'reception@hotel.cf' })
  })

  it('crée un compte sans mot de passe : la personne reçoit une invitation', async () => {
    const account = cashier()
    const calls = mockApi({
      ...defaults,
      'GET /api/v1/users': {
        body: { data: [account], meta: { total: 1, current_page: 1, last_page: 1 } },
      },
      'GET /api/v1/roles': { body: { data: [] } },
      'POST /api/v1/users': { status: 201, body: { data: account } },
      [`POST /api/v1/users/${account.id}/invitation`]: {
        status: 202,
        body: { message: `Invitation envoyée à ${account.email}.` },
      },
    })
    renderApp('/admin/utilisateurs')
    await screen.findByText(account.email)
    const user = userEvent.setup()
    // « + Utilisateur » (et non le bouton « Tutoriel : Utilisateurs et accès »).
    await user.click(screen.getByRole('button', { name: /^\+\s*Utilisateur$/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Mot de passe (facultatif)')).not.toBeRequired()
    expect(within(dialog).getByLabelText('Confirmer le mot de passe')).not.toBeRequired()
    expect(within(dialog).getByLabelText('Mot de passe (facultatif)')).toHaveAccessibleDescription(
      'Laissez vide pour envoyer automatiquement un lien permettant à l’utilisateur de choisir son mot de passe.',
    )
    await user.type(within(dialog).getByLabelText('Nom'), 'Nadia Kossi')
    await user.type(within(dialog).getByLabelText('Adresse e-mail'), 'nadia@hotel.cf')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(
      await screen.findByText(
        'Compte créé · invitation envoyée à nadia@hotel.cf pour choisir son mot de passe',
      ),
    ).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Nadia Kossi',
      email: 'nadia@hotel.cf',
      role: 'caissiere',
      active: true,
    })

    await user.click(
      screen.getByRole('button', {
        name: `Envoyer à ${account.name} un lien pour choisir son mot de passe`,
      }),
    )
    expect(await screen.findByText(`Invitation envoyée à ${account.email}.`)).toBeInTheDocument()
  })
  it('relance les envois en échec une fois le serveur d’envoi corrigé', async () => {
    const calls = mockApi({
      ...defaults,
      'GET /api/v1/settings': { body: { data: [] } },
      'GET /api/v1/settings/mail': {
        body: { data: { ...MAIL, queue: { ...MAIL.queue, pending: 0, failed: 2 } } },
      },
      'POST /api/v1/settings/mail/retry': {
        body: { message: '2 envois relancés.', data: MAIL },
      },
    })
    renderApp('/admin/parametres')
    const panel = await screen.findByRole('region', { name: 'Envoi des e-mails' })
    expect(await within(panel).findByText(/2 envoi\(s\) n’ont pas pu partir/)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(within(panel).getByRole('button', { name: 'Relancer les envois en échec' }))
    expect(await screen.findByText('2 envois relancés.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/v1/settings/mail/retry')).toBe(
      true,
    )
  })
})
