import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/queryClient'
import { StatusPage } from './StatusPage'

function renderPage(onError = vi.fn()) {
  const client = createQueryClient(onError)
  client.setDefaultOptions({ queries: { retry: false } })
  render(
    <QueryClientProvider client={client}>
      <StatusPage />
    </QueryClientProvider>,
  )
  return onError
}

describe('StatusPage', () => {
  it("affiche l'API et la base comme opérationnelles", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          application: 'JB Hôtel',
          api_version: 'v1',
          database: 'ok',
          server_time: '2026-11-19T12:30:00+01:00',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    renderPage()

    const services = within(screen.getByRole('region', { name: 'Services' }))
    expect(await services.findByText('Opérationnelle')).toBeInTheDocument()
    expect(services.getByText('Disponible')).toBeInTheDocument()
    expect(services.getByText('19 novembre 2026 à 12:30')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Vue d’ensemble' })).toHaveTextContent(
      'Opérationnelle',
    )
  })

  it('signale une API injoignable et déclenche la modale d’erreur', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    const onError = renderPage()

    expect(
      await within(screen.getByRole('region', { name: 'Services' })).findByText('Injoignable'),
    ).toBeInTheDocument()
    expect(onError).toHaveBeenCalledOnce()
  })
})
