import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/errors'
import type { Reservation, Room } from '../../shared/api/types'
import {
  computePrice,
  conflictsFor,
  hotelIso,
  localExtensionPreview,
  localFreeRooms,
  localModificationPreview,
  localOccupancy,
  localPlanning,
  localQuote,
  rateAt,
  rateGridQuery,
  stayInterval,
  type RateGridRow,
} from './offlineBooking'

// Bangui : UTC+1 toute l'année.
const NOW = Date.parse('2026-12-01T10:00:00+01:00')

const VIP = { id: 'type-vip', code: 'VIP', label: 'VIP', description: null }
const STD = { id: 'type-std', code: 'STD', label: 'Standard', description: null }

function room(id: string, number: string, type = VIP, capacity = 2, maintenance = false): Room {
  return {
    id,
    number,
    capacity,
    room_type: type,
    maintenance_status: maintenance ? 'MAINTENANCE' : 'AVAILABLE',
    maintenance_label: maintenance ? 'Maintenance' : 'Disponible',
    maintenance_note: null,
    notes: null,
  }
}

const rate = (amount: number, from: string, to: string | null = null) => ({
  id: `rate-${amount}`,
  amount_fcfa: amount,
  effective_from: from,
  effective_to: to,
})

const GRID: RateGridRow[] = [
  {
    room_type: VIP,
    rates: {
      DAY: {
        current: rate(50000, '2026-01-01T00:00:00+01:00', '2026-12-10T00:00:00+01:00'),
        next: rate(60000, '2026-12-10T00:00:00+01:00'),
      },
      HALF_DAY: { current: rate(30000, '2026-01-01T00:00:00+01:00'), next: null },
    },
  },
  {
    room_type: STD,
    rates: { DAY: { current: rate(25000, '2026-01-01T00:00:00+01:00'), next: null } },
  },
]

function stay(
  id: string,
  roomId: string,
  from: string,
  until: string,
  status = 'CONFIRMED',
): Reservation {
  return {
    id,
    status,
    status_label: status,
    room: {
      id: roomId,
      number: roomId,
      room_type: { code: 'VIP', label: 'VIP' },
      capacity: 2,
      under_maintenance: false,
    },
    customer: null,
    period: {
      start_date: from.slice(0, 10),
      end_date: until.slice(0, 10),
      start_time: null,
      end_time: null,
      blocked_from: from,
      blocked_until: until,
      is_estimated: true,
    },
    price: {
      billing_unit: 'DAY',
      billing_unit_label: 'Journée',
      amount_due_fcfa: 100000,
      unit_price_fcfa: 50000,
      quantity: 2,
      gross_fcfa: 100000,
      discount: null,
      discount_fcfa: 0,
      net_fcfa: 100000,
    },
    occupants: [],
    notes: null,
    checked_in_at: null,
    checked_out_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: null,
  }
}

function hotel(stays: Reservation[] = []): QueryClient {
  const client = new QueryClient()
  client.setQueryData(
    ['catalog', 'rooms'],
    [room('r101', '101'), room('r102', '102', STD), room('r103', '103', VIP, 4, true)],
  )
  client.setQueryData(rateGridQuery.queryKey, GRID)
  for (const s of stays) client.setQueryData(['reservations', s.id], s)
  return client
}

const booking = {
  room_id: 'r101',
  start_date: '2026-12-02',
  end_date: '2026-12-04',
  billing_unit: 'DAY' as const,
  quantity: 2,
  occupants: [{ name: 'NGUEMA Paul', is_primary: true }],
}

describe('Réservation calculée sur le poste (lot 4, 4.5)', () => {
  it('bloque la période comme le serveur, à l’heure de Bangui (D-009)', () => {
    const allDay = stayInterval('2026-12-02', '2026-12-04', null, null)
    expect(hotelIso(allDay.from)).toBe('2026-12-02T00:00:00+01:00')
    expect(hotelIso(allDay.until)).toBe('2026-12-05T00:00:00+01:00')
    expect(allDay.estimated).toBe(true)
    const timed = stayInterval('2026-12-02', '2026-12-04', '14:00', '11:00')
    expect(hotelIso(timed.from)).toBe('2026-12-02T14:00:00+01:00')
    expect(hotelIso(timed.until)).toBe('2026-12-04T11:00:00+01:00')
    expect(timed.estimated).toBe(false)
  })

  it('calcule le prix en FCFA entiers avec l’arrondi des remises (D-008)', () => {
    expect(
      computePrice(50000, 1, { type: 'PERCENT', value: '10', reason: 'Fidélité' }),
    ).toMatchObject({
      gross_fcfa: 50000,
      discount_fcfa: 5000,
      net_fcfa: 45000,
      discount: { value: '10.00' },
    })
    // 12,5 % de 33 333 = 4 166,6 → 4 167 (demi supérieur).
    expect(
      computePrice(33333, 1, { type: 'PERCENT', value: '12.5', reason: 'x' }).discount_fcfa,
    ).toBe(4167)
    expect(() => computePrice(10000, 1, { type: 'FIXED', value: 20000, reason: 'x' })).toThrow(
      /dépasse le montant brut/,
    )
  })

  it('prend le tarif en vigueur, puis la version suivante à sa date', () => {
    expect(rateAt(GRID, 'type-vip', 'DAY', NOW)?.amount_fcfa).toBe(50000)
    expect(
      rateAt(GRID, 'type-vip', 'DAY', Date.parse('2026-12-10T08:00:00+01:00'))?.amount_fcfa,
    ).toBe(60000)
    expect(rateAt(GRID, 'type-std', 'HALF_DAY', NOW)).toBeNull()
  })

  it('voit les conflits, y compris un séjour en cours au départ dépassé (D-056)', () => {
    const client = hotel([
      stay('a', 'r101', '2026-12-03T00:00:00+01:00', '2026-12-05T00:00:00+01:00'),
      stay('b', 'r102', '2026-11-28T00:00:00+01:00', '2026-11-30T00:00:00+01:00', 'IN_PROGRESS'),
      stay('c', 'r101', '2026-12-02T00:00:00+01:00', '2026-12-03T00:00:00+01:00', 'CANCELLED'),
    ])
    const period = stayInterval('2026-12-02', '2026-12-04', null, null)
    expect(
      conflictsFor(client, 'r101', period.from, period.until, null, NOW).map((s) => s.id),
    ).toEqual(['a'])
    // Départ dépassé : la chambre 102 reste bloquée, même sur une période future.
    expect(
      conflictsFor(client, 'r102', period.from, period.until, null, NOW).map((s) => s.id),
    ).toEqual(['b'])
    expect(localFreeRooms(client, { ...booking, min_capacity: 1 }, NOW)).toEqual([])
  })

  it('propose les chambres libres, hors maintenance et de capacité suffisante', () => {
    const free = localFreeRooms(hotel(), { ...booking, min_capacity: 1 }, NOW)
    expect(free.map((row) => row.room.number)).toEqual(['101', '102'])
    expect(localFreeRooms(hotel(), { ...booking, min_capacity: 3 }, NOW)).toEqual([])
  })

  it('établit un devis de même forme que le serveur', () => {
    const quote = localQuote(
      hotel(),
      { ...booking, discount: { type: 'PERCENT', value: '10', reason: 'Fidélité' } },
      NOW,
    )
    expect(quote).toMatchObject({
      available: true,
      conflicts: [],
      room: { number: '101', room_type: { code: 'VIP' } },
      period: {
        blocked_from: '2026-12-02T00:00:00+01:00',
        blocked_until: '2026-12-05T00:00:00+01:00',
        is_estimated: true,
      },
      price: { unit_price_fcfa: 50000, quantity: 2, gross_fcfa: 100000, net_fcfa: 90000 },
    })
  })

  it('refuse comme le serveur : capacité, demi-journée dépassée, tarifs absents', () => {
    const tooMany = { ...booking, occupants: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }
    expect(() => localQuote(hotel(), tooMany, NOW)).toThrow(/au maximum 2 occupant/)

    let overrun: unknown
    try {
      localQuote(
        hotel(),
        {
          ...booking,
          billing_unit: 'HALF_DAY',
          quantity: 1,
          start_date: '2026-12-02',
          end_date: '2026-12-03',
          start_time: '08:00',
          end_time: '10:00',
        },
        NOW,
      )
    } catch (error) {
      overrun = error
    }
    expect(overrun).toBeInstanceOf(ApiError)
    expect((overrun as ApiError).code).toBe('half_day_overrun')
    expect((overrun as ApiError).details).toContain('Quantité nécessaire : 3.')

    const client = hotel()
    client.removeQueries({ queryKey: rateGridQuery.queryKey })
    expect(() => localQuote(client, booking, NOW)).toThrow(/Tout télécharger pour le hors ligne/)
  })

  it('prolonge au prix unitaire du séjour et vérifie seulement la période ajoutée', () => {
    const current = stay('s', 'r101', '2026-12-02T00:00:00+01:00', '2026-12-04T00:00:00+01:00')
    current.period.end_date = '2026-12-03'
    const next = stay('n', 'r101', '2026-12-05T00:00:00+01:00', '2026-12-06T00:00:00+01:00')
    const client = hotel([current, next])

    const one = localExtensionPreview(
      client,
      current,
      { end_date: '2026-12-04', additional_quantity: 1 },
      NOW,
    )
    expect(one).toMatchObject({
      possible: true,
      supplement_fcfa: 50000,
      proposed_price: { quantity: 3, net_fcfa: 150000 },
      new_period: { blocked_until: '2026-12-05T00:00:00+01:00' },
    })

    const two = localExtensionPreview(
      client,
      current,
      { end_date: '2026-12-05', additional_quantity: 2 },
      NOW,
    )
    expect(two.possible).toBe(false)
    expect(two.conflicts.map((c) => c.id)).toEqual(['n'])
    expect(() =>
      localExtensionPreview(
        client,
        current,
        { end_date: '2026-12-05', additional_quantity: 1 },
        NOW,
      ),
    ).toThrow(/calculé entre les dates de départ est de 2/)
  })
})

describe('Modification sur le poste (D-058, 4.13)', () => {
  const current = stay('m', 'r101', '2026-12-02T00:00:00+01:00', '2026-12-04T00:00:00+01:00')
  const change = {
    room_id: 'r101',
    start_date: '2026-12-02',
    end_date: '2026-12-04',
    start_time: null,
    end_time: null,
    billing_unit: 'DAY' as const,
    quantity: 2,
  }
  const free = { invoiced: false, canCreditInvoices: false, extended: false }

  it('reprend les règles du serveur avant de calculer le nouveau prix', () => {
    expect(localModificationPreview(hotel([current]), current, change, free, NOW)).toMatchObject({
      available: true,
      current_net_fcfa: 100000,
      price: { net_fcfa: 100000 },
    })
    expect(() =>
      localModificationPreview(hotel(), { ...current, status: 'IN_PROGRESS' }, change, free, NOW),
    ).toThrow(/utilisez la prolongation/)
    expect(() =>
      localModificationPreview(hotel(), current, change, { ...free, extended: true }, NOW),
    ).toThrow(/déjà été prolongée/)
    expect(() =>
      localModificationPreview(hotel(), current, change, { ...free, invoiced: true }, NOW),
    ).toThrow(/seul un administrateur/)
    expect(
      localModificationPreview(
        hotel(),
        current,
        change,
        { ...free, invoiced: true, canCreditInvoices: true },
        NOW,
      ).available,
    ).toBe(true)
  })
})

describe('Planning et occupation sur le poste (lot 4)', () => {
  it('donne l’état de chaque chambre pour chaque jour, comme le serveur', () => {
    const client = hotel([
      stay('a', 'r101', '2026-12-02T00:00:00+01:00', '2026-12-04T00:00:00+01:00'),
      stay('b', 'r102', '2026-11-30T00:00:00+01:00', '2026-12-02T00:00:00+01:00', 'IN_PROGRESS'),
    ])
    const planning = localPlanning(client, '2026-12-01', 4, '', NOW)
    expect(planning.days).toEqual(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'])
    const byRoom = Object.fromEntries(planning.data.map((row) => [row.room.number, row.days]))
    expect(byRoom['101']).toEqual({
      '2026-12-01': 'FREE',
      '2026-12-02': 'RESERVED',
      '2026-12-03': 'RESERVED',
      '2026-12-04': 'FREE',
    })
    // Séjour en cours : occupée, et au-delà du départ prévu tant que le départ n’est pas fait (D-056).
    expect(byRoom['102']!['2026-12-01']).toBe('OCCUPIED')
    expect(byRoom['103']!['2026-12-01']).toBe('MAINTENANCE')
    expect(localPlanning(client, '2026-12-01', 1, 'type-std', NOW).data).toHaveLength(1)

    const occupancy = localOccupancy(client, NOW)
    const now = Object.fromEntries(occupancy.data.map((row) => [row.room.number, row]))
    expect(now['101']).toMatchObject({ state: 'FREE', next: { id: 'a' }, reserved_later: true })
    expect(now['102']).toMatchObject({
      state: 'OCCUPIED',
      state_label: 'Occupée',
      current: { id: 'b' },
    })
    expect(now['103']).toMatchObject({ state: 'MAINTENANCE', state_label: 'En maintenance' })
  })
})
