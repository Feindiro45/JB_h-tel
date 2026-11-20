import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import { AppProviders } from '../app/AppProviders'
import { routes } from '../app/routes'
import type { CurrentUser } from '../shared/api/types'

type Reply = { status?: number; body?: unknown }
type Handler = Reply | ((request: { url: URL; body: unknown }) => Reply)

export interface ApiCall {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
}

/**
 * Faux serveur : routes « MÉTHODE /chemin » → réponse. Toute route inconnue répond 404 en JSON,
 * comme l'API. Retourne la liste des appels reçus, dans l'ordre.
 */
export function mockApi(handlers: Record<string, Handler>): ApiCall[] {
  const calls: ApiCall[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body })
    const defaultHandlers: Record<string, Reply> = {
      'GET /api/v1/alerts/summary': {
        body: {
          data: { at: '2026-12-01T10:00:00+01:00', total: 0, rooms: 0, day: 0, half_day: 0 },
        },
      },
      'GET /api/v1/payment-methods': {
        body: {
          data: [
            { value: 'CASH', label: 'Espèces' },
            { value: 'MOBILE_MONEY', label: 'Mobile money' },
            { value: 'CARD', label: 'Carte bancaire' },
            { value: 'BANK_TRANSFER', label: 'Virement' },
          ],
        },
      },
      'GET /api/v1/cash-agents': {
        body: { data: [{ id: '0190a000-0000-7000-8000-000000000001', name: 'Grâce' }] },
      },
      'GET /api/v1/room-types': { body: { data: [] } },
    }
    const handler = { ...defaultHandlers, ...handlers }[`${method} ${url.pathname}`]
    const reply: Reply = handler
      ? typeof handler === 'function'
        ? handler({ url, body })
        : handler
      : { status: 404, body: { title: 'Introuvable', message: 'Ressource introuvable.' } }
    const status = reply.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return calls
}

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

const CASHIER_PERMISSIONS = [
  'customers.manage',
  'customers.view',
  'discounts.apply',
  'invoices.issue',
  'invoices.view',
  'payments.record',
  'payments.view',
  'rates.view',
  'reports.view',
  'reservations.cancel',
  'reservations.check_in_out',
  'reservations.create',
  'reservations.update',
  'reservations.view',
  'rooms.view',
]

export function cashier(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: '0190a000-0000-7000-8000-000000000001',
    name: 'Awa Caissière',
    email: 'caissiere@jbhotel.local',
    active: true,
    role: 'caissiere',
    role_label: 'Caissière',
    permissions: CASHIER_PERMISSIONS,
    last_login_at: null,
    ...overrides,
  }
}

export const EMPTY_DASHBOARD = {
  data: {
    date: '2026-12-01',
    collected_today_fcfa: 0,
    collected_last_7_days: [],
    invoiced_month_fcfa: 0,
    receivables_fcfa: 0,
    arrivals_today: [],
    departures_today: [],
    recent_reservations: [],
  },
}

/** Administrateur : droits de la caissière plus annulation, remboursement et avoir. */
export function admin(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return cashier({
    id: '0190a000-0000-7000-8000-000000000002',
    name: 'Directeur',
    email: 'admin@jbhotel.local',
    role: 'admin',
    role_label: 'Administrateur',
    permissions: [
      ...CASHIER_PERMISSIONS,
      'payments.cancel',
      'refunds.create',
      'invoices.credit',
      'users.view',
      'users.manage',
      'roles.manage',
      'rooms.manage',
      'rates.manage',
      'settings.manage',
      'audit.view',
      'reports.export',
    ],
    ...overrides,
  })
}
