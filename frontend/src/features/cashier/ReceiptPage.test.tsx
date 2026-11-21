import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Receipt } from '../../shared/api/types'
import { cashier, mockApi, renderApp } from '../../test/renderApp'

const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 'pay-1',
    receipt_number: 'REC-2026-000042',
    amount_fcfa: 20000,
    refunded_fcfa: 0,
    method: 'MOBILE_MONEY',
    method_label: 'Mobile money',
    reference: 'MM-778',
    received_at: '2026-12-01T09:00:00+01:00',
    cashier: { id: 'u1', name: 'Grâce' },
    status: 'VALID',
    status_label: 'Validé',
    cancelled_at: null,
    cancellation_reason: null,
    refunds: [],
    reservation: { id: 'res-1', status_label: 'Confirmée' },
    stay: {
      start_date: '2026-12-01',
      start_time: '14:00',
      end_date: '2026-12-02',
      end_time: null,
      billing_unit_label: 'Journée',
      quantity: 1,
    },
    customer: { id: 'c1', full_name: 'NGUEMA Paul' },
    room: { id: 'r1', number: '101', room_type: 'VIP' },
    summary: {
      amount_due_fcfa: 50000,
      paid_fcfa: 20000,
      refunded_fcfa: 0,
      net_paid_fcfa: 20000,
      balance_fcfa: 30000,
      status: 'PARTIALLY_PAID',
      status_label: 'Partiellement payé',
    },
    summary_at: '2026-12-01T10:00:00+01:00',
    hotel: {
      name: 'JB Hôtel',
      city: 'Bangui, République centrafricaine',
      tax_id: null,
      trade_register: null,
    },
    ...overrides,
  }
}

function serve(data: Receipt) {
  mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier() } },
    'GET /api/v1/payments/pay-1': { body: { data } },
  })
}

describe('Reçu imprimable', () => {
  it('reprend l’en-tête de l’hôtel, le versement et le reste à payer', async () => {
    serve(receipt())
    renderApp('/documents/recus/pay-1')

    const paper = await screen.findByRole('article', { name: 'Reçu REC-2026-000042' })
    const text = normalize(paper.textContent)
    expect(text).toContain('JB Hôtel')
    expect(text).toContain('Bangui, République centrafricaine')
    expect(text).toContain('NGUEMA Paul')
    expect(text).toContain('MM-778')
    expect(text).toContain('Montant du reçu20 000 FCFA')
    // Avance de 20 000 sur 50 000 : reste 30 000 (critère du document 06).
    expect(text).toContain('Reste à payer30 000 FCFA')
    expect(screen.getByRole('button', { name: 'Imprimer / PDF' })).toBeInTheDocument()
  })

  it('signale un encaissement annulé', async () => {
    serve(
      receipt({
        status: 'CANCELLED',
        status_label: 'Annulé',
        cancelled_at: '2026-12-01T11:00:00+01:00',
        cancellation_reason: 'Saisie en double',
      }),
    )
    renderApp('/documents/recus/pay-1')

    const note = await screen.findByRole('note')
    expect(normalize(note.textContent)).toContain('motif : Saisie en double')
    expect(normalize(note.textContent)).toContain('plus de valeur de paiement')
  })
})
