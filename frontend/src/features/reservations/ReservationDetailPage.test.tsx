import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Reservation } from '../../shared/api/types'
import { reportUnreachable } from '../../shared/offline/connectivity'
import { readOutbox } from '../../shared/offline/outbox'
import { addDays, todayIso } from '../../shared/utils/format'
import { admin, cashier, mockApi, renderApp } from '../../test/renderApp'

const ID = '0190a000-0000-7000-8000-0000000000aa'
const normalize = (text: string | null) => (text ?? '').replace(/\s/g, ' ')

function reservation(overrides: Partial<Reservation> = {}, startDate = todayIso()): Reservation {
  return {
    id: ID,
    status: 'CONFIRMED',
    status_label: 'Confirmée',
    room: {
      id: 'room-101',
      number: '101',
      room_type: { code: 'VIP', label: 'VIP' },
      capacity: 2,
      under_maintenance: false,
    },
    customer: { id: 'cust-1', full_name: 'NGUEMA Paul', phone: '+236 70 00 00 00' },
    period: {
      start_date: startDate,
      end_date: addDays(startDate, 1),
      start_time: null,
      end_time: null,
      blocked_from: `${startDate}T00:00:00+01:00`,
      blocked_until: `${addDays(startDate, 2)}T00:00:00+01:00`,
      is_estimated: true,
    },
    price: {
      billing_unit: 'DAY',
      billing_unit_label: 'Journée',
      unit_price_fcfa: 50000,
      quantity: 1,
      gross_fcfa: 50000,
      discount: null,
      discount_fcfa: 0,
      net_fcfa: 50000,
      amount_due_fcfa: 50000,
    },
    occupants: [{ id: 'o1', name: 'Paul Nguema', is_primary: true }],
    notes: null,
    checked_in_at: null,
    checked_out_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: '2026-11-19T10:00:00+01:00',
    ...overrides,
  }
}

/** Avance de 20 000 sur 50 000 : solde 30 000 (critère d'acceptation du document 06). */
const SUMMARY = {
  amount_due_fcfa: 50000,
  paid_fcfa: 20000,
  refunded_fcfa: 0,
  net_paid_fcfa: 20000,
  balance_fcfa: 30000,
  status: 'PARTIALLY_PAID',
  status_label: 'Partiellement payé',
}

const INVOICE = {
  id: '0190a000-0000-7000-8000-0000000000f1',
  type: 'INVOICE',
  type_label: 'Facture',
  number: 'FAC-2026-000001',
  issued_at: '2026-11-19T10:00:00+01:00',
  status: 'ISSUED',
  status_label: 'Émise',
  credited_invoice: null,
  gross_fcfa: 50000,
  discount_fcfa: 0,
  net_fcfa: 50000,
  verification_url: 'http://localhost/verification',
}

function serve(r: Reservation, permissions?: string[], extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier(permissions ? { permissions } : {}) } },
    [`GET /api/v1/reservations/${ID}`]: { body: { data: r } },
    [`GET /api/v1/reservations/${ID}/payments`]: { body: { data: [], summary: SUMMARY } },
    [`GET /api/v1/reservations/${ID}/invoices`]: { body: { data: [] } },
    [`GET /api/v1/reservations/${ID}/history`]: { body: { data: [] } },
    [`POST /api/v1/reservations/${ID}/payments`]: ({ body }) => ({
      status: 201,
      body: {
        data: {
          id: 'pay-1',
          receipt_number: 'REC-2026-000042',
          amount_fcfa: (body as { amount_fcfa: number }).amount_fcfa,
        },
      },
    }),
    [`POST /api/v1/reservations/${ID}/extension/preview`]: {
      body: {
        data: {
          current_period: r.period,
          new_period: {
            ...r.period,
            blocked_until: `${addDays(r.period.start_date, 3)}T00:00:00+01:00`,
          },
          current_price: r.price,
          proposed_price: { ...r.price, quantity: 2, gross_fcfa: 100000, net_fcfa: 100000 },
          supplement_fcfa: 50000,
          possible: true,
          conflicts: [],
          requires_confirmation: true,
        },
      },
    },
    [`POST /api/v1/reservations/${ID}/extension`]: { body: { data: r } },
    ...extra,
  })
}

describe('Fiche réservation', () => {
  it('guide les opérations suivantes et donne accès à la facture automatique sans émission manuelle', async () => {
    serve(reservation(), undefined, {
      [`GET /api/v1/reservations/${ID}/invoices`]: { body: { data: [INVOICE] } },
    })
    renderApp(`/reservations/${ID}`)
    const guide = await screen.findByRole('region', { name: 'Les étapes du séjour' })
    expect(within(guide).getAllByRole('listitem')).toHaveLength(5)
    expect(
      await within(guide).findByRole('link', { name: 'Ouvrir le ticket de facture' }),
    ).toHaveAttribute('href', `/documents/factures/${INVOICE.id}/ticket`)
    expect(within(guide).getByText('Prochaine opération')).toBeVisible()
    expect(within(guide).getByRole('button', { name: 'Enregistrer l’arrivée' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Émettre une facture' })).toBeNull()
  })
  it('affiche le solde calculé par le serveur et les actions permises', async () => {
    serve(reservation())
    renderApp(`/reservations/${ID}`)

    expect(await screen.findByRole('heading', { name: 'NGUEMA Paul' })).toBeInTheDocument()
    const cash = screen.getByRole('region', { name: 'Récapitulatif de caisse' })
    await within(cash).findByText('Partiellement payé')
    expect(normalize(cash.textContent)).toContain('Solde30 000 FCFA')
    expect(screen.getByRole('button', { name: 'Enregistrer l’arrivée' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encaisser' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler la réservation' })).toBeInTheDocument()
  })

  it('n’offre pas l’arrivée avant la date prévue', async () => {
    serve(reservation({}, addDays(todayIso(), 30)))
    renderApp(`/reservations/${ID}`)

    expect(
      await screen.findByText(/L’arrivée pourra être enregistrée à partir du/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer l’arrivée' })).not.toBeInTheDocument()
  })

  it('masque les actions sans la permission du serveur', async () => {
    serve(reservation(), ['reservations.view', 'payments.view'])
    renderApp(`/reservations/${ID}`)

    await screen.findByRole('heading', { name: 'NGUEMA Paul' })
    await screen.findByText('Partiellement payé')
    expect(screen.queryByRole('button', { name: 'Encaisser' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prolonger' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annuler la réservation' })).not.toBeInTheDocument()
  })

  it('encaisse le solde, refuse un trop-perçu avant tout envoi', async () => {
    const calls = serve(reservation())
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Encaisser' }))
    const dialog = screen.getByRole('dialog', { name: 'Encaisser' })
    const amount = within(dialog).getByLabelText('Montant (FCFA)')
    expect(amount).toHaveValue(30000)

    await user.clear(amount)
    await user.type(amount, '35000')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’encaissement' }))
    expect(normalize(within(dialog).getByText(/dépasse le solde/).textContent)).toContain(
      '30 000 FCFA',
    )
    expect(calls.some((call) => call.method === 'POST')).toBe(false)

    await user.clear(amount)
    await user.type(amount, '30000')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’encaissement' }))
    expect(
      await screen.findByText('Encaissement enregistré — reçu REC-2026-000042'),
    ).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      amount_fcfa: 30000,
      method: 'CASH',
      reference: null,
    })
  })

  it('renvoie le même encaissement avec la même clé après une erreur passagère (lot 3)', async () => {
    let attempts = 0
    serve(reservation(), undefined, {
      [`POST /api/v1/reservations/${ID}/payments`]: () =>
        ++attempts === 1
          ? { status: 503, body: { title: 'Service indisponible', message: 'Réessayez.' } }
          : { status: 201, body: { data: { id: 'pay-1', receipt_number: 'REC-2026-000042' } } },
    })
    const fetchSpy = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Encaisser' }))
    const dialog = screen.getByRole('dialog', { name: 'Encaisser' })
    const submit = within(dialog).getByRole('button', { name: 'Enregistrer l’encaissement' })
    await user.click(submit)
    const error = await screen.findByRole('alertdialog')
    await user.click(within(error).getAllByRole('button', { name: /Fermer/ })[0]!)
    await user.click(submit)
    expect(
      await screen.findByText('Encaissement enregistré — reçu REC-2026-000042'),
    ).toBeInTheDocument()

    const keys = fetchSpy.mock.calls
      .filter(([url, init]) => String(url).endsWith(`/${ID}/payments`) && init.method === 'POST')
      .map(([, init]) => (init.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(keys[1]).toBe(keys[0])
  })

  it('encaisse hors ligne : reçu provisoire, solde recalculé, opération gardée (lot 4)', async () => {
    serve(reservation())
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Encaisser' }))
    let dialog = screen.getByRole('dialog', { name: 'Encaisser' })
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))

    // Coupure réelle : le serveur ne répond plus.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    reportUnreachable()
    await user.click(screen.getByRole('button', { name: 'Encaisser' }))
    dialog = screen.getByRole('dialog', { name: 'Encaisser' })
    const amount = within(dialog).getByLabelText('Montant (FCFA)')
    await user.clear(amount)
    await user.type(amount, '10000')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’encaissement' }))

    expect(
      await screen.findByText(
        /Encaissement gardé sur ce poste — reçu provisoire LOC-POSTE1-000001/,
      ),
    ).toBeVisible()
    expect(screen.getAllByText('LOC-POSTE1-000001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('En attente d’envoi').length).toBeGreaterThan(0)
    // Avance de 20 000 + 10 000 hors ligne sur 50 000 : il reste 20 000.
    expect(normalize(document.body.textContent)).toContain('Solde20 000 FCFA')
    const [operation] = await readOutbox()
    expect(operation).toMatchObject({
      status: 'pending',
      kind: 'payment.record',
      path: `/api/v1/reservations/${ID}/payments`,
      body: { amount_fcfa: 10000, method: 'CASH', reference: null },
    })
  })

  it('calcule les jours ajoutés depuis le départ actuel et transmet ce calcul à l’aperçu', async () => {
    const stay = reservation()
    const calls = serve(stay)
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Prolonger' }))
    const dialog = screen.getByRole('dialog', { name: 'Prolonger le séjour' })
    const days = within(dialog).getByLabelText('Jours à ajouter')
    expect(days).toHaveValue(1)
    expect(days).toHaveAttribute('readonly')
    const departure = within(dialog).getByLabelText('Nouvelle date de départ')
    fireEvent.change(departure, { target: { value: '' } })
    expect(days).toHaveValue(null)
    expect(within(dialog).getByRole('button', { name: 'Calculer le supplément' })).toBeDisabled()
    const end = addDays(stay.period.end_date, 3)
    fireEvent.change(departure, { target: { value: end } })
    expect(days).toHaveValue(3)
    await user.click(within(dialog).getByRole('button', { name: 'Calculer le supplément' }))
    await screen.findByRole('dialog', { name: 'Valider la prolongation' })
    expect(calls.find((call) => call.path.endsWith('/extension/preview'))?.body).toMatchObject({
      end_date: end,
      additional_quantity: 3,
    })
  })

  it('prolonge en deux temps : aperçu du supplément, puis validation explicite', async () => {
    const calls = serve(reservation())
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Prolonger' }))
    await user.click(screen.getByRole('button', { name: 'Calculer le supplément' }))

    const confirm = await screen.findByRole('dialog', { name: 'Valider la prolongation' })
    expect(normalize(confirm.textContent)).toContain('Supplément50 000 FCFA')
    expect(calls.some((call) => call.path.endsWith('/extension'))).toBe(false)

    await user.click(within(confirm).getByRole('button', { name: /^Valider/ }))
    expect(await screen.findByText('Séjour prolongé')).toBeInTheDocument()
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/extension'))?.body).toMatchObject({
        additional_quantity: 1,
        confirm: true,
      }),
    )
  })

  /** D-053 : la facture d'un séjour prolongé est remplacée dans la même opération. */
  it('prolonge un séjour facturé et annonce la facture de remplacement détaillée', async () => {
    const r = reservation()
    serve(r, undefined, {
      [`GET /api/v1/reservations/${ID}/invoices`]: { body: { data: [INVOICE] } },
      [`POST /api/v1/reservations/${ID}/extension`]: {
        body: { data: r, meta: { replacement_invoice_number: 'FAC-2026-000002' } },
      },
    })
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await screen.findAllByText(/FAC-2026-000001/)
    await user.click(await screen.findByRole('button', { name: 'Prolonger' }))
    await user.click(screen.getByRole('button', { name: 'Calculer le supplément' }))
    const confirm = await screen.findByRole('dialog', { name: 'Valider la prolongation' })
    expect(confirm).toHaveTextContent(
      'La facture FAC-2026-000001 sera annulée par un avoir et remplacée par une nouvelle facture qui détaille le séjour initial et la prolongation.',
    )

    await user.click(within(confirm).getByRole('button', { name: /^Valider/ }))
    expect(
      await screen.findByText(
        'Séjour prolongé · nouvelle facture FAC-2026-000002 (séjour initial et prolongation)',
      ),
    ).toBeInTheDocument()
  })

  /** D-053 : une annulation payée rembourse l'encaissé et annule la facture, en une opération. */
  it('l’administrateur annule une réservation payée en remboursant l’encaissé', async () => {
    const calls = serve(reservation(), admin().permissions, {
      [`GET /api/v1/reservations/${ID}/invoices`]: { body: { data: [INVOICE] } },
      [`POST /api/v1/reservations/${ID}/cancel`]: {
        body: { data: reservation({ status: 'CANCELLED', status_label: 'Annulée' }) },
      },
    })
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await screen.findByText('Partiellement payé')
    await screen.findAllByText(/FAC-2026-000001/)
    await user.click(screen.getByRole('button', { name: 'Annuler la réservation' }))
    const dialog = screen.getByRole('dialog', { name: 'Annuler la réservation' })
    expect(normalize(dialog.textContent)).toContain(
      '20 000 FCFA déjà encaissés seront remboursés intégralement',
    )
    expect(dialog).toHaveTextContent('La facture FAC-2026-000001 sera annulée par un avoir.')

    await user.type(within(dialog).getByLabelText('Motif d’annulation'), 'Client empêché')
    await user.selectOptions(within(dialog).getByLabelText('Moyen de remboursement'), 'CASH')
    await user.click(within(dialog).getByRole('button', { name: /^Annuler et rembourser 20/ }))

    expect(
      await screen.findByText((text) =>
        normalize(text).includes('Réservation annulée, 20 000 FCFA remboursés'),
      ),
    ).toBeInTheDocument()
    expect(calls.find((call) => call.path.endsWith('/cancel'))?.body).toEqual({
      reason: 'Client empêché',
      refund_fcfa: 20000,
      refund_method: 'CASH',
    })
  })

  it('la caissière ne peut pas annuler une réservation déjà payée', async () => {
    const calls = serve(reservation())
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await screen.findByText('Partiellement payé')
    await user.click(screen.getByRole('button', { name: 'Annuler la réservation' }))
    const dialog = screen.getByRole('dialog', { name: 'Annuler la réservation' })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'demandez à un administrateur de l’effectuer',
    )
    expect(within(dialog).queryByLabelText('Moyen de remboursement')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^Annuler et rembourser/ })).toBeDisabled()
    expect(calls.some((call) => call.path.endsWith('/cancel'))).toBe(false)
  })

  it('affiche un montant dû nul pour une réservation annulée, prix initial pour mémoire', async () => {
    serve(
      reservation({
        status: 'CANCELLED',
        status_label: 'Annulée',
        price: { ...reservation().price, amount_due_fcfa: 0 },
      }),
    )
    renderApp(`/reservations/${ID}`)

    const metric = (await screen.findByText('Montant dû')).closest('.metric')
    expect(normalize(metric?.textContent ?? '')).toContain('0 FCFA')
    expect(normalize(metric?.textContent ?? '')).toContain('prix initial 50 000 FCFA')
  })
})

describe('Corrections et suppressions (D-058)', () => {
  const room102 = {
    id: 'room-102',
    number: '102',
    capacity: 2,
    room_type: { id: 't-std', code: 'STANDARD', label: 'Standard', description: null },
    maintenance_status: 'AVAILABLE',
    maintenance_label: 'Disponible',
    maintenance_note: null,
    notes: null,
  }
  const payment = (cashierId: string, receipt: string) => ({
    id: `pay-${receipt}`,
    receipt_number: receipt,
    amount_fcfa: 20000,
    refunded_fcfa: 0,
    method: 'CASH',
    method_label: 'Espèces',
    reference: null,
    received_at: new Date().toISOString(),
    cashier: { id: cashierId, name: 'Agent' },
    status: 'VALID',
    status_label: 'Validé',
    cancelled_at: null,
    cancellation_reason: null,
    refunds: [],
  })

  it('modifie la réservation en deux temps : nouveau prix, puis motif obligatoire', async () => {
    const r = reservation()
    const calls = serve(r, undefined, {
      'GET /api/v1/rooms': { body: { data: [room102] } },
      [`POST /api/v1/reservations/${ID}/modification/preview`]: {
        body: {
          data: {
            room: { ...room102, under_maintenance: false },
            period: r.period,
            price: { ...r.price, unit_price_fcfa: 30000, net_fcfa: 30000, gross_fcfa: 30000 },
            available: true,
            conflicts: [],
            current_net_fcfa: 50000,
          },
        },
      },
      [`POST /api/v1/reservations/${ID}/modification`]: {
        body: { data: r, meta: { replacement_invoice_number: null } },
      },
    })
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Modifier la réservation' }))
    const dialog = screen.getByRole('dialog', { name: 'Modifier la réservation' })
    await within(dialog).findByRole('option', { name: /^102/ })
    await user.selectOptions(within(dialog).getByLabelText('Chambre'), 'room-102')
    await user.click(within(dialog).getByRole('button', { name: 'Calculer le nouveau prix' }))
    expect(
      await within(dialog).findByText('30 000 FCFA', { normalizer: normalize }),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la modification' }))
    expect(
      within(dialog).getByText('Le motif de la modification est obligatoire.'),
    ).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Motif de la modification'), 'Chambre mal saisie')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la modification' }))

    expect(await screen.findByText('Réservation modifiée')).toBeInTheDocument()
    expect(calls.find((c) => c.path.endsWith('/modification'))?.body).toMatchObject({
      room_id: 'room-102',
      billing_unit: 'DAY',
      reason: 'Chambre mal saisie',
    })
  })

  it('l’administrateur supprime avec avertissement, motif et confirmation explicite', async () => {
    const calls = serve(reservation(), admin().permissions, {
      [`DELETE /api/v1/reservations/${ID}`]: {
        body: {
          message: 'Réservation supprimée. Une copie est conservée dans le journal d’audit.',
        },
      },
      'GET /api/v1/reservations': {
        body: { data: [], meta: { total: 0, current_page: 1, last_page: 1 } },
      },
    })
    const router = renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Supprimer' }))
    const warning = screen.getByRole('alertdialog', { name: 'Supprimer la réservation' })
    expect(warning).toHaveTextContent('irréversible')
    const submit = within(warning).getByRole('button', { name: 'Supprimer définitivement' })
    expect(submit).toBeDisabled()
    await user.type(within(warning).getByLabelText('Motif de la suppression'), 'Saisie en double')
    await user.click(within(warning).getByLabelText('Je confirme la suppression définitive'))
    await user.click(submit)

    expect(
      await screen.findByText(
        'Réservation supprimée. Une copie est conservée dans le journal d’audit.',
      ),
    ).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({ reason: 'Saisie en double' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/reservations'))
  })

  it('la caissière n’a pas le bouton Supprimer', async () => {
    serve(reservation())
    renderApp(`/reservations/${ID}`)
    await screen.findByRole('heading', { name: 'NGUEMA Paul' })
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()
  })

  it('la caissière peut annuler son propre encaissement du jour, pas celui d’une collègue', async () => {
    serve(reservation(), undefined, {
      [`GET /api/v1/reservations/${ID}/payments`]: {
        body: {
          data: [
            payment(cashier().id, 'REC-2026-000010'),
            payment('autre-agent', 'REC-2026-000011'),
          ],
          summary: SUMMARY,
        },
      },
    })
    renderApp(`/reservations/${ID}`)

    expect(
      await screen.findByRole('button', { name: 'Annuler le reçu REC-2026-000010' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Annuler le reçu REC-2026-000011' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rembourser le reçu/ })).not.toBeInTheDocument()
  })
})

describe('Étapes enchaînées et départ guidé (D-071)', () => {
  it('après l’arrivée, la fenêtre d’encaissement du solde s’ouvre d’elle-même', async () => {
    let current = reservation()
    serve(current, undefined, {
      [`GET /api/v1/reservations/${ID}`]: () => ({ body: { data: current } }),
      [`POST /api/v1/reservations/${ID}/check-in`]: () => {
        current = reservation({ status: 'IN_PROGRESS', status_label: 'En cours' })
        return { body: { data: current } }
      },
    })
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Enregistrer l’arrivée' }))
    const arrival = screen.getByRole('dialog', { name: 'Enregistrer l’arrivée' })
    await user.click(within(arrival).getByRole('button', { name: 'Enregistrer l’arrivée' }))

    const payment = await screen.findByRole('dialog', { name: 'Encaisser' })
    expect(normalize(payment.textContent)).toContain('Solde restant : 30 000 FCFA')
  })

  it('un départ non soldé exige l’encaissement ou un motif, transmis au serveur', async () => {
    const calls = serve(
      reservation({ status: 'IN_PROGRESS', status_label: 'En cours' }),
      undefined,
      {
        [`POST /api/v1/reservations/${ID}/check-out`]: {
          body: { data: reservation({ status: 'COMPLETED', status_label: 'Terminée' }) },
        },
      },
    )
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Enregistrer le départ' }))
    const dialog = screen.getByRole('dialog', { name: 'Enregistrer le départ' })
    expect(normalize((await within(dialog).findByRole('status')).textContent)).toContain(
      'Il reste 30 000 FCFA à encaisser sur ce séjour.',
    )
    expect(within(dialog).getByRole('button', { name: 'Encaisser le solde' })).toBeVisible()

    const submit = within(dialog).getByRole('button', { name: 'Enregistrer le départ' })
    await user.click(submit)
    expect(
      within(dialog).getByText(
        'Encaissez le solde, ou cochez « Le client part sans tout payer » et indiquez le motif.',
      ),
    ).toBeVisible()
    await user.click(within(dialog).getByLabelText('Le client part sans tout payer'))
    await user.click(submit)
    expect(
      within(dialog).getByText('Indiquez pourquoi le client part sans tout payer.'),
    ).toBeVisible()
    expect(calls.some((call) => call.path.endsWith('/check-out'))).toBe(false)

    await user.type(
      within(dialog).getByLabelText('Motif du départ avec solde impayé'),
      'Entreprise : paiement par virement',
    )
    await user.click(submit)
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/check-out'))?.body).toEqual({
        unpaid_reason: 'Entreprise : paiement par virement',
      }),
    )
    // La notification, et non l’intitulé « Départ enregistré » de la fiche mise à jour.
    await waitFor(() =>
      expect(document.querySelector('.toast')).toHaveTextContent('Départ enregistré'),
    )
  })

  it('hors ligne, le départ non soldé est gardé avec son motif pour le serveur', async () => {
    serve(reservation({ status: 'IN_PROGRESS', status_label: 'En cours' }))
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Enregistrer le départ' }))
    const dialog = screen.getByRole('dialog', { name: 'Enregistrer le départ' })
    await within(dialog).findByRole('status')

    // Coupure réelle : le serveur ne répond plus.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    reportUnreachable()
    await user.click(within(dialog).getByLabelText('Le client part sans tout payer'))
    await user.type(
      within(dialog).getByLabelText('Motif du départ avec solde impayé'),
      'Paiera demain à l’accueil',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le départ' }))

    // La notification, et non l’intitulé « Départ enregistré » de la fiche mise à jour.
    await waitFor(() =>
      expect(document.querySelector('.toast')).toHaveTextContent('Départ enregistré'),
    )
    const [operation] = await readOutbox()
    expect(operation).toMatchObject({
      status: 'pending',
      kind: 'reservation.check-out',
      path: `/api/v1/reservations/${ID}/check-out`,
      body: { unpaid_reason: 'Paiera demain à l’accueil' },
    })
  })

  it('encaisse le solde depuis la fenêtre de départ, puis enregistre le départ sans motif', async () => {
    let summary = SUMMARY
    const calls = serve(
      reservation({ status: 'IN_PROGRESS', status_label: 'En cours' }),
      undefined,
      {
        [`GET /api/v1/reservations/${ID}/payments`]: () => ({ body: { data: [], summary } }),
        [`POST /api/v1/reservations/${ID}/payments`]: () => {
          summary = { ...SUMMARY, paid_fcfa: 50000, net_paid_fcfa: 50000, balance_fcfa: 0 }
          return { status: 201, body: { data: { id: 'pay-2', receipt_number: 'REC-2026-000043' } } }
        },
        [`POST /api/v1/reservations/${ID}/check-out`]: {
          body: { data: reservation({ status: 'COMPLETED', status_label: 'Terminée' }) },
        },
      },
    )
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Enregistrer le départ' }))
    await user.click(await screen.findByRole('button', { name: 'Encaisser le solde' }))
    const payment = screen.getByRole('dialog', { name: 'Encaisser' })
    await user.click(within(payment).getByRole('button', { name: 'Enregistrer l’encaissement' }))

    const dialog = await screen.findByRole('dialog', { name: 'Enregistrer le départ' })
    expect(
      await within(dialog).findByText(/Le séjour est soldé : rien à encaisser\./),
    ).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le départ' }))
    await waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/check-out'))).toBeDefined(),
    )
    expect(calls.find((call) => call.path.endsWith('/check-out'))?.body).toBeUndefined()
    expect(
      calls.find((call) => call.path.endsWith('/payments') && call.method === 'POST')?.body,
    ).toMatchObject({ amount_fcfa: 30000 })
  })
})

describe('Fiche d’une réservation de salle de conférence (D-072)', () => {
  it('montre l’événement, l’occupant et le contact à la place des occupants', async () => {
    serve(
      reservation({
        room: {
          id: 'room-hall',
          number: 'SALLE-A',
          room_type: { code: 'SALLE_CONFERENCE', label: 'Salle de conférence', kind: 'CONFERENCE' },
          capacity: 120,
          under_maintenance: false,
        },
        occupants: [],
        event: {
          name: 'Atelier santé communautaire',
          organizer_type: 'NGO',
          organizer_type_label: 'ONG',
          organizer_type_other: null,
          organization_name: 'Santé pour tous',
          contact_name: 'Jean Yakité',
          contact_phone: '+236 75 11 22 33',
        },
      }),
    )
    renderApp(`/reservations/${ID}`)

    expect(
      await screen.findByRole('heading', { name: 'Atelier santé communautaire', level: 1 }),
    ).toBeVisible()
    const panel = screen.getByRole('region', { name: 'Informations sur l’événement' })
    const text = normalize(panel.textContent)
    for (const expected of [
      'Type d’occupantONG',
      'OrganisationSanté pour tous',
      'Responsable sur placeJean Yakité · +236 75 11 22 33',
      'Client (réservation)NGUEMA Paul',
    ]) {
      expect(text).toContain(expected)
    }
    expect(text).not.toContain('Occupants')
    expect(screen.queryByRole('button', { name: 'Modifier les occupants' })).toBeNull()
    expect(screen.getByText('Début de l’événement')).toBeVisible()
  })
})
