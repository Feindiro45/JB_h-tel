import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Reservation } from '../../shared/api/types'
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

    expect(await screen.findByText(/Arrivée enregistrable à partir du/)).toBeInTheDocument()
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
