import { screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { admin, mockApi, renderApp } from '../../test/renderApp'

it('présente séparément les montants facturés et encaissés et propose les exports autorisés', async () => {
  mockApi({
    'GET /api/v1/auth/me': { body: { data: admin() } },
    'GET /api/v1/rooms': { body: { data: [] } },
    'GET /api/v1/report-agents': { body: { data: [] } },
    'GET /api/v1/reports/financial': {
      body: {
        data: {
          totals: {
            collected_fcfa: 20000,
            refunded_fcfa: 5000,
            net_collected_fcfa: 15000,
            net_invoiced_fcfa: 50000,
            discount_fcfa: 0,
            stays_count: 1,
            booked_fcfa: 50000,
            receivables_fcfa: 35000,
          },
          occupancy: {
            at: '2026-12-01T10:00:00+01:00',
            occupied: 0,
            reserved: 1,
            free: 1,
            maintenance: 0,
          },
          daily: [
            { date: '2026-12-01', collected_fcfa: 20000, refunded_fcfa: 5000, net_fcfa: 15000 },
          ],
          by_type: [],
          reconciliation: { difference_fcfa: 0 },
          definitions: ['Les montants réservés ne sont pas un chiffre d’affaires comptable.'],
        },
      },
    },
  })
  renderApp('/rapports')
  expect(await screen.findByText('Encaissé net')).toBeInTheDocument()
  expect(screen.getByText('Facturé net')).toBeInTheDocument()
  expect(screen.getByText(/chiffre d’affaires comptable/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Exporter CSV' })).toHaveAttribute(
    'href',
    expect.stringContaining('format=csv'),
  )
  expect(screen.getByRole('link', { name: 'Exporter PDF' })).toHaveAttribute(
    'href',
    expect.stringContaining('format=pdf'),
  )
})
