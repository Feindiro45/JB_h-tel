import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { InvoiceRow } from '../../shared/api/types'
import { admin, cashier, mockApi, renderApp } from '../../test/renderApp'

const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

function invoice(overrides: Partial<InvoiceRow>): InvoiceRow {
  return {
    id: 'inv-1',
    type: 'INVOICE',
    type_label: 'Facture',
    number: 'FAC-2026-000001',
    issued_at: '2026-12-01T10:00:00+01:00',
    status: 'ISSUED',
    status_label: 'Émise',
    credited_invoice: null,
    gross_fcfa: 50000,
    discount_fcfa: 0,
    net_fcfa: 50000,
    verification_url: 'http://localhost:8000/verification/factures/inv-1?code=abc',
    reservation: { id: 'res-1' },
    customer: { full_name: 'NGUEMA Paul' },
    room: { number: '101', type: 'VIP' },
    ...overrides,
  }
}

function serve(user = cashier()) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: user } },
    'GET /api/v1/invoices': {
      body: {
        data: [
          invoice({}),
          invoice({
            id: 'inv-2',
            number: 'FAC-2026-000002',
            status: 'CREDITED',
            status_label: 'Annulée par avoir',
            net_fcfa: 30000,
          }),
          invoice({
            id: 'inv-3',
            type: 'CREDIT_NOTE',
            type_label: 'Avoir',
            number: 'AV-2026-000001',
            net_fcfa: 30000,
            credited_invoice: { id: 'inv-2', number: 'FAC-2026-000002' },
          }),
        ],
        meta: { total: 3, current_page: 1, last_page: 1 },
        totals: {
          invoices_fcfa: 80000,
          credit_notes_fcfa: 30000,
          net_invoiced_fcfa: 50000,
          count: 3,
        },
      },
    },
    'POST /api/v1/invoices/inv-1/credit-notes': {
      status: 201,
      body: { data: invoice({ id: 'inv-4', type: 'CREDIT_NOTE', number: 'AV-2026-000002' }) },
    },
    'GET /api/v1/payments': {
      body: {
        data: [
          {
            id: 'pay-1',
            receipt_number: 'REC-2026-000001',
            amount_fcfa: 20000,
            refunded_fcfa: 0,
            method: 'CASH',
            method_label: 'Espèces',
            reference: null,
            received_at: '2026-12-01T09:00:00+01:00',
            cashier: { id: 'u1', name: 'Grâce' },
            status: 'VALID',
            status_label: 'Validé',
            cancelled_at: null,
            cancellation_reason: null,
            refunds: [],
            reservation: { id: 'res-1', status: 'CONFIRMED', status_label: 'Confirmée' },
            customer: { id: 'c1', full_name: 'NGUEMA Paul' },
            room: { id: 'r1', number: '101', room_type: 'VIP' },
          },
        ],
        meta: { total: 1, current_page: 1, last_page: 1 },
      },
    },
  })
}

describe('Factures et reçus', () => {
  it('liste les factures et avoirs avec les totaux « factures − avoirs »', async () => {
    serve()
    renderApp('/documents')

    const totals = await screen.findByLabelText('Totaux des documents filtrés')
    expect(normalize(totals.textContent)).toContain('Avoirs− 30 000 FCFA')
    expect(normalize(totals.textContent)).toContain('Net facturé50 000 FCFA')
    const credit = screen.getByRole('row', { name: /AV-2026-000001/ })
    expect(normalize(credit.textContent)).toContain('annule la facture FAC-2026-000002')
    expect(normalize(credit.textContent)).toContain('− 30 000 FCFA')
    // D-065 : ni PDF A4 ni impression de page, le ticket 80 mm seulement.
    expect(
      screen.getByRole('link', { name: 'Ticket 80 mm de facture FAC-2026-000001' }),
    ).toHaveAttribute('href', '/documents/factures/inv-1/ticket')
    expect(screen.queryByRole('link', { name: /PDF/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Imprimer/ })).toBeNull()
    // La caissière ne peut pas émettre d'avoir.
    expect(screen.queryByRole('button', { name: /Émettre un avoir/ })).not.toBeInTheDocument()
  })

  it('l’administrateur émet un avoir motivé, seulement sur une facture émise', async () => {
    const calls = serve(admin())
    renderApp('/documents')
    const user = userEvent.setup()

    await screen.findByRole('row', { name: /FAC-2026-000001/ })
    expect(screen.getAllByRole('button', { name: /Émettre un avoir/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Émettre un avoir pour FAC-2026-000001' }))
    const dialog = screen.getByRole('dialog', { name: 'Émettre un avoir' })
    await user.click(within(dialog).getByRole('button', { name: 'Émettre l’avoir' }))
    expect(within(dialog).getByText('Le motif de l’avoir est obligatoire.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Motif de l’avoir'), 'Erreur de nom')
    await user.click(within(dialog).getByRole('button', { name: 'Émettre l’avoir' }))
    expect(await screen.findByText('Avoir AV-2026-000002 émis')).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ reason: 'Erreur de nom' })
  })

  it('passe à l’onglet des reçus, au clic comme au clavier', async () => {
    const calls = serve()
    const router = renderApp('/documents')
    const user = userEvent.setup()

    const invoicesTab = await screen.findByRole('tab', { name: 'Factures et avoirs' })
    expect(invoicesTab).toHaveAttribute('aria-selected', 'true')
    invoicesTab.focus()
    await user.keyboard('{ArrowRight}')

    const receiptsTab = screen.getByRole('tab', { name: 'Reçus de paiement' })
    expect(receiptsTab).toHaveAttribute('aria-selected', 'true')
    expect(receiptsTab).toHaveFocus()
    expect(router.state.location.search).toBe('?onglet=recus')
    expect(
      await screen.findByRole('link', { name: 'Ticket 80 mm du reçu REC-2026-000001' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(calls.some((call) => call.path === '/api/v1/payments')).toBe(true))
  })
})
