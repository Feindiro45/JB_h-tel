import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addDays, todayIso } from '../../shared/utils/format'
import { cashier, mockApi, renderApp } from '../../test/renderApp'

const ID = '0190a000-0000-7000-8000-0000000000d1'
const START = addDays(todayIso(), -2)
const STAY = {
  id: ID,
  status: 'IN_PROGRESS',
  status_label: 'En cours',
  departure_overdue: true,
  overdue_minutes: 90,
  room: {
    id: 'room-101',
    number: '101',
    room_type: { code: 'VIP', label: 'VIP' },
    capacity: 2,
    under_maintenance: false,
  },
  customer: { id: 'cust-1', full_name: 'NGUEMA Paul', phone: '+236 70 00 00 00' },
  period: {
    start_date: START,
    end_date: addDays(START, 1),
    start_time: null,
    end_time: '12:00',
    blocked_from: `${START}T00:00:00+01:00`,
    blocked_until: `${addDays(START, 1)}T12:00:00+01:00`,
    is_estimated: false,
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
  occupants: [],
  notes: null,
  checked_in_at: `${START}T10:00:00+01:00`,
  checked_out_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: `${START}T09:00:00+01:00`,
}
const PAID = {
  amount_due_fcfa: 50000,
  paid_fcfa: 50000,
  refunded_fcfa: 0,
  net_paid_fcfa: 50000,
  balance_fcfa: 0,
  status: 'PAID',
  status_label: 'Payé',
}

function serve(permissions?: string[]) {
  let overdue = 1
  const calls = mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier(permissions ? { permissions } : {}) } },
    'GET /api/v1/reservations': {
      body: { data: [], meta: { total: 0, current_page: 1, last_page: 1 } },
    },
    'GET /api/v1/rooms': { body: { data: [] } },
    'GET /api/v1/room-types': { body: { data: [] } },
    'GET /api/v1/alerts/summary': () => ({
      body: {
        data: {
          at: `${todayIso()}T10:00:00+01:00`,
          total: overdue,
          rooms: overdue,
          day: overdue,
          half_day: 0,
        },
      },
    }),
    'GET /api/v1/alerts': () => ({
      body: {
        data: overdue ? [STAY] : [],
        meta: { total: overdue, current_page: 1, last_page: 1 },
        at: `${todayIso()}T10:00:00+01:00`,
      },
    }),
    [`GET /api/v1/reservations/${ID}/payments`]: { body: { data: [], summary: PAID } },
    [`POST /api/v1/reservations/${ID}/check-out`]: () => {
      overdue = 0
      return { body: { data: { ...STAY, status: 'COMPLETED', status_label: 'Terminée' } } }
    },
  })
  return calls
}

describe('Départs à enregistrer (D-071)', () => {
  it('s’impose sur l’écran en cours avec l’opération à faire, et se met en attente 10 min sur demande', async () => {
    serve()
    renderApp('/reservations')
    const user = userEvent.setup()

    const reminder = await screen.findByRole('alertdialog', { name: 'Départs à enregistrer' })
    expect(within(reminder).getByText('Chambre 101 · NGUEMA Paul')).toBeVisible()
    expect(within(reminder).getByText('En retard de 1 h 30 min')).toBeVisible()
    expect(within(reminder).getByRole('button', { name: 'Enregistrer le départ' })).toBeVisible()
    expect(within(reminder).getByRole('button', { name: 'Prolonger le séjour' })).toBeVisible()

    await user.click(within(reminder).getByRole('button', { name: 'Me le rappeler dans 10 min' }))
    expect(screen.queryByRole('alertdialog', { name: 'Départs à enregistrer' })).toBeNull()
    // Pas de retour immédiat : le rappel attend le délai choisi.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('alertdialog', { name: 'Départs à enregistrer' })).toBeNull()
  })

  it('enregistre le départ depuis la fenêtre, qui ne revient plus une fois le retard traité', async () => {
    const calls = serve()
    renderApp('/reservations')
    const user = userEvent.setup()

    const reminder = await screen.findByRole('alertdialog', { name: 'Départs à enregistrer' })
    await user.click(within(reminder).getByRole('button', { name: 'Enregistrer le départ' }))
    const dialog = await screen.findByRole('dialog', { name: 'Enregistrer le départ' })
    expect(await within(dialog).findByText(/Le séjour est soldé/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le départ' }))

    expect(await screen.findByText('Départ enregistré — chambre 101 libérée')).toBeVisible()
    await waitFor(() =>
      expect(calls.filter((call) => call.path === '/api/v1/alerts/summary').length).toBeGreaterThan(
        1,
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('alertdialog', { name: 'Départs à enregistrer' })).toBeNull()
  })

  it('ne s’affiche pas pour un compte qui ne peut pas enregistrer les départs', async () => {
    const calls = serve(['reservations.view'])
    renderApp('/reservations')
    await screen.findByRole('heading', { name: 'Réservations', level: 1 })
    await waitFor(() =>
      expect(calls.some((call) => call.path === '/api/v1/reservations')).toBe(true),
    )
    expect(screen.queryByRole('alertdialog', { name: 'Départs à enregistrer' })).toBeNull()
    expect(calls.some((call) => call.path === '/api/v1/alerts')).toBe(false)
  })
})
