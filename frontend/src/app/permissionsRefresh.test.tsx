import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ME_KEY } from '../features/auth'
import { reportUnreachable } from '../shared/offline/connectivity'
import { saveQueryCache } from '../shared/offline/persistence'
import { cashier, mockApi, renderApp } from '../test/renderApp'

const allowed = cashier()
const restricted = cashier({
  permissions: allowed.permissions.filter((permission) => permission !== 'reservations.create'),
})
const reservations = {
  'GET /api/v1/reservations': {
    body: { data: [], meta: { total: 0, current_page: 1, last_page: 1 } },
  },
}

describe('Actualisation des droits communs aux caissières', () => {
  it('actualise les droits accordés et retirés au retour sur une session déjà ouverte', async () => {
    let current = restricted
    const calls = mockApi({
      ...reservations,
      'GET /api/v1/auth/me': () => ({ body: { data: current } }),
    })
    renderApp('/reservations')
    await screen.findByRole('heading', { name: 'Réservations' })
    expect(screen.queryByRole('button', { name: /Nouvelle réservation/ })).not.toBeInTheDocument()

    current = allowed
    fireEvent.focus(window)
    expect(await screen.findByRole('button', { name: /Nouvelle réservation/ })).toBeInTheDocument()

    current = restricted
    fireEvent.focus(window)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Nouvelle réservation/ }),
      ).not.toBeInTheDocument(),
    )
    expect(calls.filter((call) => call.path === '/api/v1/auth/me').length).toBeGreaterThanOrEqual(3)
  })

  it('remplace les anciens droits restaurés par ceux du serveur au démarrage', async () => {
    const cached = new QueryClient()
    cached.setQueryData(ME_KEY, restricted)
    await saveQueryCache(cached)
    mockApi({ ...reservations, 'GET /api/v1/auth/me': { body: { data: allowed } } })

    renderApp('/reservations')
    expect(await screen.findByRole('button', { name: /Nouvelle réservation/ })).toBeInTheDocument()
    cached.clear()
  })

  it('conserve les derniers droits connus pendant une panne réseau', async () => {
    const cached = new QueryClient()
    cached.setQueryData(ME_KEY, allowed)
    cached.setQueryData(['reservations', {}], reservations['GET /api/v1/reservations'].body)
    await saveQueryCache(cached)
    reportUnreachable()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    renderApp('/reservations')
    expect(await screen.findByRole('button', { name: /Nouvelle réservation/ })).toBeInTheDocument()
    fireEvent.focus(window)
    expect(screen.getByRole('button', { name: /Nouvelle réservation/ })).toBeInTheDocument()
    cached.clear()
  })
})
