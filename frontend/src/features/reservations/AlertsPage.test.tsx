import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { cashier, mockApi, renderApp } from '../../test/renderApp'
import { overdueDuration } from './alerts'

const ID = '0190a000-0000-7000-8000-0000000000ab'
const ALERT = {
  id: ID,
  status: 'IN_PROGRESS',
  status_label: 'En cours',
  departure_overdue: true,
  customer: { id: 'customer-1', full_name: 'DOKO Émile', phone: '+236 75 00 12 34' },
  room: { id: 'room-101', number: '101', room_type: { label: 'VIP' } },
  period: {
    start_date: '2026-12-01',
    end_date: '2026-12-01',
    start_time: '08:00',
    end_time: '12:00',
    blocked_from: '2026-12-01T08:00:00+01:00',
    blocked_until: '2026-12-01T12:00:00+01:00',
    is_estimated: false,
  },
  price: {
    billing_unit: 'HALF_DAY',
    billing_unit_label: 'Demi-journée',
    quantity: 1,
    unit_price_fcfa: 30000,
    gross_fcfa: 30000,
    net_fcfa: 30000,
    discount: null,
    discount_fcfa: 0,
    amount_due_fcfa: 30000,
  },
  occupants: [],
  checked_in_at: '2026-12-01T09:00:00+01:00',
  checked_out_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  notes: null,
  overdue_minutes: 90,
}
const SUMMARY = { at: '2026-12-01T13:30:00+01:00', total: 1, rooms: 1, day: 0, half_day: 1 }

describe('Menu et page des alertes', () => {
  it('affiche le compteur réel et les départs dépassés avec un accès au séjour', async () => {
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'GET /api/v1/alerts/summary': { body: { data: SUMMARY } },
      'GET /api/v1/alerts': {
        body: { at: SUMMARY.at, data: [ALERT], meta: { total: 1, current_page: 1, last_page: 1 } },
      },
    })
    renderApp('/alertes')
    expect(await screen.findByRole('heading', { name: /^Alertes$/ })).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Alertes : 1 départ dépassé' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('DOKO Émile')).toBeInTheDocument()
    expect(screen.getByText('1 h 30 min')).toHaveClass('badge--red')
    expect(screen.getByRole('link', { name: 'Traiter le séjour' })).toHaveAttribute(
      'href',
      `/reservations/${ID}`,
    )
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Vue d’ensemble' })).toBeInTheDocument()
  })

  it('pagine et applique la recherche ou le forfait automatiquement en revenant à la première page', async () => {
    const calls = mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'GET /api/v1/alerts': ({ url }) => ({
        body: {
          at: SUMMARY.at,
          data: [ALERT],
          meta: {
            total: 26,
            current_page: Number(url.searchParams.get('page') ?? 1),
            last_page: 2,
          },
        },
      }),
    })
    renderApp('/alertes')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Page suivante' }))
    await waitFor(() =>
      expect(calls.filter((call) => call.path === '/api/v1/alerts').at(-1)?.query.page).toBe('2'),
    )
    await user.type(screen.getByLabelText('Client ou chambre'), '101')
    await waitFor(() =>
      expect(calls.filter((call) => call.path === '/api/v1/alerts').at(-1)?.query).toMatchObject({
        page: '1',
        search: '101',
      }),
    )
    await user.selectOptions(screen.getByLabelText('Forfait'), 'HALF_DAY')
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === '/api/v1/alerts').at(-1)?.query.billing_unit,
      ).toBe('HALF_DAY'),
    )
  })

  it('actualise automatiquement le compteur et les lignes sans recharger la page', async () => {
    let resolved = false
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'GET /api/v1/alerts/summary': () => ({
        body: { data: { ...SUMMARY, total: resolved ? 0 : 1 } },
      }),
      'GET /api/v1/alerts': () => ({
        body: {
          at: SUMMARY.at,
          data: resolved ? [] : [ALERT],
          meta: { total: resolved ? 0 : 1, current_page: 1, last_page: 1 },
        },
      }),
    })
    renderApp('/alertes')
    await screen.findByText('DOKO Émile')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      // Forcer le prochain cycle d'observation après activation des intervalles simulés.
      await userEvent.setup().click(screen.getByRole('button', { name: 'Actualiser' }))
      await screen.findByText('DOKO Émile')
      resolved = true
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      await screen.findByText('Aucun départ à traiter')
      expect(screen.getByRole('link', { name: 'Alertes : 0 départ dépassé' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('retire le compteur après un départ validé depuis la fiche', async () => {
    let completed = false
    mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier() } },
      'GET /api/v1/alerts/summary': () => ({
        body: { data: { ...SUMMARY, total: completed ? 0 : 1 } },
      }),
      [`GET /api/v1/reservations/${ID}`]: () => ({
        body: {
          data: {
            ...ALERT,
            status: completed ? 'COMPLETED' : 'IN_PROGRESS',
            departure_overdue: !completed,
          },
        },
      }),
      [`GET /api/v1/reservations/${ID}/payments`]: {
        body: {
          data: [],
          summary: {
            balance_fcfa: 0,
            amount_due_fcfa: 30000,
            paid_fcfa: 30000,
            net_paid_fcfa: 30000,
            refunded_fcfa: 0,
            status: 'PAID',
            status_label: 'Payé',
          },
        },
      },
      [`GET /api/v1/reservations/${ID}/invoices`]: { body: { data: [] } },
      [`GET /api/v1/reservations/${ID}/history`]: { body: { data: [] } },
      [`POST /api/v1/reservations/${ID}/check-out`]: () => {
        completed = true
        return { body: { data: { ...ALERT, status: 'COMPLETED' } } }
      },
    })
    renderApp(`/reservations/${ID}`)
    const user = userEvent.setup()
    expect(await screen.findByText('Départ prévu dépassé.')).toBeInTheDocument()
    await screen.findByRole('link', { name: 'Alertes : 1 départ dépassé' })
    await user.click(screen.getByRole('button', { name: 'Enregistrer le départ' }))
    const dialog = screen.getByRole('dialog', { name: 'Enregistrer le départ' })
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le départ' }))
    await screen.findByRole('link', { name: 'Alertes : 0 départ dépassé' })
    await waitFor(() => expect(screen.queryByText('Départ prévu dépassé.')).not.toBeInTheDocument())
  })

  it('cache le menu et ne charge aucune alerte sans permission', async () => {
    const calls = mockApi({
      'GET /api/v1/auth/me': { body: { data: cashier({ permissions: ['customers.view'] }) } },
    })
    renderApp('/alertes')
    await screen.findByText(/accès/i, { selector: 'h1' })
    expect(screen.queryByRole('link', { name: /Alertes/ })).not.toBeInTheDocument()
    expect(calls.some((call) => call.path.startsWith('/api/v1/alerts'))).toBe(false)
  })
})

it('présente un dépassement en jours, heures et minutes', () => {
  expect(overdueDuration(0)).toBe('À l’instant')
  expect(overdueDuration(1)).toBe('1 min')
  expect(overdueDuration(1501)).toBe('1 j 1 h 1 min')
})
