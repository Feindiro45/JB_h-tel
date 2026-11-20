import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cashier, mockApi, renderApp } from '../test/renderApp'

const KEY = 'jb-hotel.sidebar-collapsed'

function serve() {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier() } },
    'GET /api/v1/alerts': {
      body: {
        at: '2026-12-01T10:00:00+01:00',
        data: [],
        meta: { total: 0, current_page: 1, last_page: 1 },
      },
    },
    'GET /api/v1/reservations': {
      body: { data: [], meta: { total: 0, current_page: 1, last_page: 1 } },
    },
    'GET /api/v1/rooms': { body: { data: [] } },
  })
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('Menu latéral sur ordinateur', () => {
  it('réduit et déploie le menu sans perdre le contenu ni le choix après navigation', async () => {
    serve()
    const router = renderApp('/alertes')
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: 'Réduire le menu latéral' })
    await user.type(screen.getByLabelText('Client ou chambre'), '101')
    await user.click(button)
    expect(document.querySelector('.layout')).toHaveClass('layout--sidebar-collapsed')
    expect(screen.getByLabelText('Client ou chambre')).toHaveValue('101')
    expect(screen.getByRole('button', { name: 'Déployer le menu latéral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(localStorage.getItem(KEY)).toBe('true')
    await user.click(screen.getByRole('link', { name: /^Réservations$/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/reservations'))
    expect(document.querySelector('.layout')).toHaveClass('layout--sidebar-collapsed')
    await user.click(screen.getByRole('button', { name: 'Déployer le menu latéral' }))
    expect(document.querySelector('.layout')).not.toHaveClass('layout--sidebar-collapsed')
    expect(localStorage.getItem(KEY)).toBe('false')
  })

  it('restaure la préférence enregistrée au démarrage', async () => {
    localStorage.setItem(KEY, 'true')
    serve()
    renderApp('/alertes')
    const button = await screen.findByRole('button', { name: 'Déployer le menu latéral' })
    expect(button).toHaveAttribute('aria-controls', 'navigation')
    expect(document.querySelector('.layout')).toHaveClass('layout--sidebar-collapsed')
    expect(screen.getByRole('link', { name: /^Alertes$/ })).toHaveAttribute('title', 'Alertes')
  })

  it('reste utilisable si le navigateur interdit le stockage local', async () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Accès refusé')
    })
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Accès refusé')
    })
    try {
      serve()
      renderApp('/alertes')
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: 'Réduire le menu latéral' }))
      expect(screen.getByRole('button', { name: 'Déployer le menu latéral' })).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    } finally {
      read.mockRestore()
      write.mockRestore()
    }
  })
})
