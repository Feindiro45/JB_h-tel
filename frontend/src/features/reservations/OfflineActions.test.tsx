import { QueryClient } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reservation } from '../../shared/api/types'
import { reportReachable, reportUnreachable } from '../../shared/offline/connectivity'
import { readOutbox } from '../../shared/offline/outbox'
import { sendPendingOperations } from '../../shared/offline/outboxSync'
import { saveQueryCache } from '../../shared/offline/persistence'
import { setQueryClientRef } from '../../shared/offline/queryClientRef'
import { rememberSession } from '../../shared/offline/session'
import { addDays, todayIso } from '../../shared/utils/format'
import { cashier, renderApp } from '../../test/renderApp'
import { issueInvoice } from '../invoices/api'
import { confirmReservation, modifyReservation, previewModification, replaceOccupants } from './api'

const USER = cashier()
const VIP = { id: 'type-vip', code: 'VIP', label: 'VIP', description: null }
const room = (id: string, number: string, capacity: number) => ({
  id,
  number,
  capacity,
  room_type: VIP,
  maintenance_status: 'AVAILABLE',
  maintenance_label: 'Disponible',
  maintenance_note: null,
  notes: null,
})
const ROOMS = [room('room-101', '101', 2), room('room-102', '102', 4)]
const GRID = [
  {
    room_type: VIP,
    rates: {
      DAY: {
        current: {
          id: 'rate',
          amount_fcfa: 50000,
          effective_from: '2020-01-01T00:00:00+01:00',
          effective_to: null,
        },
        next: null,
      },
    },
  },
]

function stay(id: string, roomId: string, status: string, start: string, end: string): Reservation {
  const number = roomId === 'room-101' ? '101' : '102'
  return {
    id,
    status,
    status_label: status === 'PENDING' ? 'En attente' : 'Confirmée',
    room: {
      id: roomId,
      number,
      room_type: { code: 'VIP', label: 'VIP' },
      capacity: number === '101' ? 2 : 4,
      under_maintenance: false,
    },
    customer: { id: 'cust-1', full_name: 'NGUEMA Paul', phone: null },
    period: {
      start_date: start,
      end_date: end,
      start_time: null,
      end_time: null,
      blocked_from: `${start}T00:00:00+01:00`,
      blocked_until: `${addDays(end, 1)}T00:00:00+01:00`,
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
    occupants: [{ id: 'o1', name: 'NGUEMA Paul', is_primary: true }],
    notes: null,
    checked_in_at: null,
    checked_out_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: null,
  }
}

const TODAY = todayIso()
const SOON = addDays(todayIso(), 5)
const CONFIRMED = stay('srv-confirmed', 'room-101', 'CONFIRMED', TODAY, addDays(TODAY, 1))
const PENDING = stay('srv-pending', 'room-102', 'PENDING', SOON, addDays(SOON, 1))
const SUMMARY = {
  amount_due_fcfa: 50000,
  paid_fcfa: 20000,
  refunded_fcfa: 0,
  net_paid_fcfa: 20000,
  balance_fcfa: 30000,
  status: 'PARTIALLY_PAID',
  status_label: 'Partiellement payé',
}

function seed(client: QueryClient): QueryClient {
  client.setQueryData(['auth', 'me'], USER)
  client.setQueryData(['catalog', 'rooms'], ROOMS)
  client.setQueryData(['rates', 'grid'], GRID)
  for (const s of [CONFIRMED, PENDING]) {
    client.setQueryData(['reservations', s.id], s)
    client.setQueryData(['invoices', s.id], [])
    client.setQueryData(['reservations', s.id, 'history'], [])
  }
  client.setQueryData(['payments', CONFIRMED.id], { data: [], summary: SUMMARY })
  client.setQueryData(['payments', PENDING.id], {
    data: [],
    summary: { ...SUMMARY, paid_fcfa: 0, net_paid_fcfa: 0, balance_fcfa: 50000 },
  })
  return client
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  setQueryClientRef(null)
  localStorage.clear()
})

describe('Actions hors ligne, suite (lot 4, 4.13)', () => {
  it('confirme, change les occupants, modifie et facture sans réseau, puis tout part au serveur', async () => {
    const client = seed(new QueryClient())
    setQueryClientRef(client)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
    reportUnreachable()

    // Confirmation : la chambre reste libre d’après le poste.
    expect(await confirmReservation(PENDING.id)).toMatchObject({
      status: 'CONFIRMED',
      status_label: 'Confirmée — en attente d’envoi',
    })

    // Occupants : capacité de la chambre vérifiée sur le poste.
    const three = [{ name: 'A', is_primary: true }, { name: 'B' }, { name: 'C' }]
    await expect(replaceOccupants(CONFIRMED.id, three)).rejects.toThrow(/au maximum 2 occupant/)
    const occupants = await replaceOccupants(CONFIRMED.id, three.slice(0, 2))
    expect(occupants.occupants?.map((o) => o.name)).toEqual(['A', 'B'])

    // Modification : tarif en vigueur, même remise ; jamais sous l’encaissé.
    const change = {
      room_id: 'room-102',
      start_date: TODAY,
      end_date: addDays(TODAY, 2),
      start_time: null,
      end_time: null,
      billing_unit: 'DAY' as const,
      quantity: 2,
      reason: 'Chambre plus grande',
    }
    // 102 est prise du jour +5 au jour +6 : pas de conflit sur jour → jour +2.
    expect(await previewModification(CONFIRMED.id, change)).toMatchObject({
      available: true,
      current_net_fcfa: 50000,
      price: { net_fcfa: 100000 },
    })
    const modified = await modifyReservation(CONFIRMED.id, change)
    expect(modified.reservation).toMatchObject({
      room: { number: '102' },
      price: { quantity: 2, net_fcfa: 100000, amount_due_fcfa: 100000 },
    })
    expect(client.getQueryData(['payments', CONFIRMED.id])).toMatchObject({
      summary: { amount_due_fcfa: 100000, balance_fcfa: 80000 },
    })
    client.setQueryData(['payments', CONFIRMED.id], {
      data: [],
      summary: { ...SUMMARY, net_paid_fcfa: 150000 },
    })
    await expect(modifyReservation(CONFIRMED.id, change)).rejects.toThrow(
      /serait inférieur à ce qui est déjà encaissé/,
    )
    client.setQueryData(['payments', CONFIRMED.id], { data: [], summary: SUMMARY })

    // Facture provisoire FAC-LOC-… ; une seconde émission est refusée.
    const invoice = await issueInvoice(CONFIRMED.id)
    expect(invoice.number).toMatch(/^FAC-LOC-POSTE-\d{6}$/)
    expect(client.getQueryData(['invoices', 'detail', invoice.id])).toMatchObject({
      snapshot: {
        document: { label: 'Facture provisoire', number: invoice.number },
        lines: [{ label: 'Hébergement — chambre 102 (VIP), journée', amount_fcfa: 100000 }],
        totals: { net_fcfa: 100000 },
      },
    })
    expect(await issueInvoice(CONFIRMED.id)).toEqual(invoice)

    const queued = await readOutbox()
    expect(queued.map((o) => [o.kind, o.method])).toEqual([
      ['reservation.confirm', 'POST'],
      ['reservation.occupants', 'PUT'],
      ['reservation.modify', 'POST'],
      ['invoice.issue', 'POST'],
    ])

    // Retour du réseau : le serveur accepte et donne le numéro FAC définitif.
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(json({ data: { ...PENDING, status: 'CONFIRMED' } }))
      .mockResolvedValueOnce(json({ data: CONFIRMED }))
      .mockResolvedValueOnce(json({ data: CONFIRMED, meta: { replacement_invoice_number: null } }))
      .mockResolvedValueOnce(json({ data: { id: 'inv-1', number: 'FAC-2026-000007' } }, 201))
    reportReachable()
    const run = await sendPendingOperations(client, 'reconnect', USER)

    expect(run).toMatchObject({ status: 'success', records: 4 })
    const [, occupantsCall] = fetchMock.mock.calls as [string, RequestInit][]
    expect(occupantsCall![1].method).toBe('PUT')
    expect(String(occupantsCall![0])).toContain(`/api/v1/reservations/${CONFIRMED.id}/occupants`)
    expect((await readOutbox())[3]).toMatchObject({
      status: 'accepted',
      provisionalNumber: invoice.number,
      definitiveNumber: 'FAC-2026-000007',
    })
  })

  it('imprime la facture provisoire en ticket 80 mm, marquée « Provisoire »', async () => {
    const station = seed(new QueryClient())
    setQueryClientRef(station)
    reportUnreachable()
    await confirmReservation(PENDING.id)
    await saveQueryCache(station)
    await rememberSession(USER, 'Secret-2026')
    localStorage.setItem('jb-hotel.last-activity', String(Date.now()))
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
    reportUnreachable()
    renderApp(`/reservations/${PENDING.id}`)
    const user = userEvent.setup()

    expect(await screen.findByRole('link', { name: 'Ouvrir le ticket de facture' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Émettre une facture' })).toBeNull()

    // Ni PDF ni vérification pour une facture provisoire : le ticket 80 mm seulement.
    const invoices = screen.getByRole('region', { name: /Factures/ })
    expect(within(invoices).queryByText('PDF A4 ↗')).toBeNull()
    expect(within(invoices).queryByText('Vérification ↗')).toBeNull()
    await user.click(
      within(invoices).getByRole('link', { name: /Ticket 80 mm de facture FAC-LOC-/ }),
    )

    expect(await screen.findByText('Provisoire')).toBeVisible()
    expect(screen.getByText(/Facture provisoire émise sans réseau/)).toBeVisible()
    expect(screen.getAllByText(/^FAC-LOC-POSTE-\d{6}$/).length).toBeGreaterThan(0)
  })
})
