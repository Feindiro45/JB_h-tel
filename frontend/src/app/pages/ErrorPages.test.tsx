import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { admin, mockApi, renderApp } from '../../test/renderApp'
import { RouteErrorPage } from './RouteErrorPage'

describe('Pages d’erreur (D-060)', () => {
  it('adresse inconnue : page 404 avec message et retours possibles', async () => {
    mockApi({ 'GET /api/v1/auth/me': { body: { data: admin() } } })
    renderApp('/adresse-inconnue')

    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument()
    expect(screen.getByText('Erreur 404')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeInTheDocument()
  })

  it('écran qui plante : erreur inattendue, sans détail technique', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Boom(): never {
      throw new Error('Détail interne à ne jamais afficher')
    }
    const router = createMemoryRouter([
      { path: '/', element: <Boom />, errorElement: <RouteErrorPage /> },
    ])
    render(<RouterProvider router={router} />)

    expect(screen.getByRole('heading', { name: 'Erreur inattendue' })).toBeInTheDocument()
    expect(screen.getByText('Erreur 500')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeInTheDocument()
    expect(screen.queryByText(/Détail interne/)).not.toBeInTheDocument()
  })
})
