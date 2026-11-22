import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportReachable, reportUnreachable } from '../../shared/offline/connectivity'
import { readOutbox } from '../../shared/offline/outbox'
import { saveQueryCache } from '../../shared/offline/persistence'
import { rememberSession } from '../../shared/offline/session'
import { addDays, todayIso } from '../../shared/utils/format'
import { cashier, mockApi, renderApp } from '../../test/renderApp'

const USER = cashier()
const ACTIVITY_KEY = 'jb-hotel.last-activity'
const VIP = { id: 'type-vip', code: 'VIP', label: 'VIP', description: null }
const ROOM = {
  id: '0190a000-0000-7000-8000-000000000101',
  number: '101',
  capacity: 2,
  room_type: VIP,
  maintenance_status: 'AVAILABLE',
  maintenance_label: 'Disponible',
  maintenance_note: null,
  notes: null,
}
const CUSTOMER = {
  id: '0190a000-0000-7000-8000-0000000000c1',
  name: 'NGUEMA',
  first_name: 'Paul',
  full_name: 'NGUEMA Paul',
  phone: '+236 75 00 00 01',
  email: null,
  email_notifications: false,
  origin_city: null,
  origin_country: null,
  address: null,
  identification_type: null,
  identification_number: null,
  notes: null,
  created_at: null,
}
const PAGE = { total: 1, current_page: 1, last_page: 1 }

/** Poste déjà préparé en ligne : chambres, tarifs et clients gardés, session mémorisée. */
async function preparedStation() {
  const client = new QueryClient()
  client.setQueryData(['auth', 'me'], USER)
  client.setQueryData(['catalog', 'rooms'], [ROOM])
  client.setQueryData(
    ['rates', 'grid'],
    [
      {
        room_type: VIP,
        rates: {
          DAY: {
            current: {
              id: 'rate-1',
              amount_fcfa: 50000,
              effective_from: '2020-01-01T00:00:00+01:00',
              effective_to: null,
            },
            next: null,
          },
        },
      },
    ],
  )
  client.setQueryData(['customers', 'list', '', 1, 25, {}], { data: [CUSTOMER], meta: PAGE })
  client.setQueryData(['reservations', 'list', { page: 1, per_page: 25 }], {
    data: [],
    meta: { ...PAGE, total: 0 },
  })
  await saveQueryCache(client)
  await rememberSession(USER, 'Secret-2026')
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
}

let offlineFetch: ReturnType<typeof vi.spyOn>

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('Réservation hors ligne (lot 4, 4.5)', () => {
  it('réserve sans réseau, puis bascule sur la fiche du serveur au retour du réseau', async () => {
    await preparedStation()
    offlineFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    reportUnreachable()
    const router = renderApp('/reservations')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '+ Nouvelle réservation' }))
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle réservation' })
    expect(within(dialog).getByText(/chambres libres et prix calculés sur ce poste/)).toBeVisible()

    // Client trouvé parmi ceux gardés sur le poste.
    await user.type(within(dialog).getByLabelText('Rechercher un client'), 'ngue')
    await user.click(await within(dialog).findByRole('button', { name: /NGUEMA Paul/ }))
    expect(within(dialog).getByLabelText('Titulaire du séjour')).toHaveValue('NGUEMA Paul')

    // Chambre libre et prix calculés sur le poste.
    const room = within(dialog).getByLabelText('Chambre')
    await waitFor(() => expect(within(room).getAllByRole('option')).toHaveLength(2))
    await user.selectOptions(room, ROOM.id)
    expect(await within(dialog).findByText('50 000 FCFA')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Créer la réservation' }))

    expect(
      await screen.findByText(/Réservation gardée sur ce poste — envoyée au serveur/),
    ).toBeVisible()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/reservations\/local-/))
    expect(
      await screen.findByText('Gardée sur ce poste, pas encore reçue par le serveur.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'NGUEMA Paul', level: 1 })).toBeVisible()
    // Actions que le serveur seul peut faire : masquées tant que la réservation est locale.
    expect(screen.queryByRole('button', { name: 'Émettre une facture' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modifier la réservation' })).toBeNull()

    const [operation] = await readOutbox()
    expect(operation).toMatchObject({
      kind: 'reservation.create',
      status: 'pending',
      path: '/api/v1/reservations',
      body: {
        room_id: ROOM.id,
        customer_id: CUSTOMER.id,
        start_date: todayIso(),
        billing_unit: 'DAY',
        quantity: 1,
      },
    })

    // Retour du réseau : envoi automatique, puis la fiche définitive s’ouvre d’elle-même.
    offlineFetch.mockRestore()
    const created = {
      id: 'srv-reservation-1',
      status: 'CONFIRMED',
      status_label: 'Confirmée',
      room: { ...ROOM, room_type: { code: 'VIP', label: 'VIP' }, under_maintenance: false },
      customer: { id: CUSTOMER.id, full_name: 'NGUEMA Paul', phone: CUSTOMER.phone },
      period: {
        start_date: todayIso(),
        end_date: todayIso(),
        start_time: null,
        end_time: null,
        blocked_from: `${todayIso()}T00:00:00+01:00`,
        blocked_until: `${todayIso()}T23:59:59+01:00`,
        is_estimated: true,
      },
      price: {
        billing_unit: 'DAY',
        billing_unit_label: 'Journée',
        amount_due_fcfa: 50000,
        unit_price_fcfa: 50000,
        quantity: 1,
        gross_fcfa: 50000,
        discount: null,
        discount_fcfa: 0,
        net_fcfa: 50000,
      },
      occupants: [],
      notes: null,
      checked_in_at: null,
      checked_out_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: null,
    }
    const calls = mockApi({
      'GET /api/v1/auth/me': { body: { data: USER } },
      'POST /api/v1/reservations': { status: 201, body: { data: created } },
      'GET /api/v1/reservations/srv-reservation-1': { body: { data: created } },
      'GET /api/v1/reservations/srv-reservation-1/history': { body: { data: [] } },
      'GET /api/v1/reservations/srv-reservation-1/payments': {
        body: {
          data: [],
          summary: {
            amount_due_fcfa: 50000,
            paid_fcfa: 0,
            refunded_fcfa: 0,
            net_paid_fcfa: 0,
            balance_fcfa: 50000,
            status: 'UNPAID',
            status_label: 'Non payé',
          },
        },
      },
      'GET /api/v1/reservations/srv-reservation-1/invoices': { body: { data: [] } },
    })
    reportReachable()

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/reservations/srv-reservation-1'),
    )
    const sent = calls.find((c) => c.method === 'POST' && c.path === '/api/v1/reservations')
    expect(sent?.body).toMatchObject({ room_id: ROOM.id, customer_id: CUSTOMER.id })
    expect((await readOutbox())[0]).toMatchObject({
      status: 'accepted',
      resultId: 'srv-reservation-1',
    })
    expect(await screen.findByText('Confirmée')).toBeVisible()
  })

  it('refuse sur le poste une chambre déjà prise hors ligne, sans rien garder', async () => {
    await preparedStation()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    reportUnreachable()
    const { createReservation } = await import('./api')
    const { setQueryClientRef } = await import('../../shared/offline/queryClientRef')
    const client = new QueryClient()
    client.setQueryData(['auth', 'me'], USER)
    client.setQueryData(['catalog', 'rooms'], [ROOM])
    client.setQueryData(
      ['rates', 'grid'],
      [
        {
          room_type: VIP,
          rates: {
            DAY: {
              current: {
                id: 'r',
                amount_fcfa: 50000,
                effective_from: '2020-01-01T00:00:00+01:00',
                effective_to: null,
              },
              next: null,
            },
          },
        },
      ],
    )
    setQueryClientRef(client)
    const input = {
      room_id: ROOM.id,
      customer_id: CUSTOMER.id,
      start_date: todayIso(),
      end_date: todayIso(),
      billing_unit: 'DAY' as const,
      quantity: 1,
      occupants: [{ name: 'NGUEMA Paul', is_primary: true }],
      confirm: true,
    }

    const first = await createReservation(input)
    expect(first.id).toMatch(/^local-/)
    await expect(createReservation(input)).rejects.toThrow(
      /La chambre 101 est déjà réservée sur cette période d’après les données de ce poste/,
    )
    expect(await readOutbox()).toHaveLength(1)

    // Prolongation hors ligne : prix unitaire conservé, solde recalculé, opération gardée.
    const { extendReservation, previewExtension, cancelReservation } = await import('./api')
    const tomorrow = addDays(todayIso(), 1)
    const preview = await previewExtension(first.id, {
      end_date: tomorrow,
      end_time: null,
      additional_quantity: 1,
    })
    expect(preview).toMatchObject({ possible: true, supplement_fcfa: 50000 })
    const extended = await extendReservation(first.id, {
      end_date: tomorrow,
      end_time: null,
      additional_quantity: 1,
    })
    expect(extended.reservation).toMatchObject({
      status_label: 'Confirmée — en attente d’envoi',
      period: { end_date: tomorrow },
      price: { quantity: 2, net_fcfa: 100000, amount_due_fcfa: 100000 },
    })
    expect(client.getQueryData(['payments', first.id])).toMatchObject({
      summary: { amount_due_fcfa: 100000, balance_fcfa: 100000 },
    })

    // Une autre réservation gardée sur le poste juste après : la prolongation suivante est refusée.
    await createReservation({
      ...input,
      start_date: addDays(todayIso(), 2),
      end_date: addDays(todayIso(), 2),
    })
    await expect(
      extendReservation(first.id, {
        end_date: addDays(todayIso(), 2),
        end_time: null,
        additional_quantity: 1,
      }),
    ).rejects.toThrow(/n’est pas libre sur la prolongation demandée/)

    // Annulation hors ligne : plus rien n’est dû, la fiche attend l’envoi.
    const cancelled = await cancelReservation(first.id, {
      reason: 'Client empêché',
      refund_fcfa: 0,
      refund_method: null,
    })
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      status_label: 'Annulée — en attente d’envoi',
      cancellation_reason: 'Client empêché',
      price: { amount_due_fcfa: 0 },
    })
    expect(client.getQueryData(['payments', first.id])).toMatchObject({
      summary: { amount_due_fcfa: 0, balance_fcfa: 0, status: 'NOTHING_DUE' },
    })
    expect((await readOutbox()).map((operation) => operation.kind)).toEqual([
      'reservation.create',
      'reservation.extend',
      'reservation.create',
      'reservation.cancel',
    ])
    // Les opérations sur la réservation locale gardent sa référence, résolue à l’envoi.
    const [, extension, , cancellation] = await readOutbox()
    expect(extension!.path).toBe(`/api/v1/reservations/${first.id}/extension`)
    expect(cancellation!.path).toBe(`/api/v1/reservations/${first.id}/cancel`)
    setQueryClientRef(null)
  })
})
