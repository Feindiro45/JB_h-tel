import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { InvoiceDetail, InvoiceSnapshot } from '../../shared/api/types'
import { cashier, mockApi, renderApp } from '../../test/renderApp'

const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

function snapshot(overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot {
  return {
    document: {
      type: 'INVOICE',
      label: 'Facture',
      number: 'FAC-2026-000007',
      issued_at: '2026-12-01T12:00:00+01:00',
    },
    hotel: { name: 'JB Hôtel', city: 'Bangui' },
    customer: { full_name: 'NGUEMA Paul', phone: null, email: null, address: null },
    room: { number: '101', type: 'VIP' },
    stay: {
      reservation_uuid: 'res-1',
      start_date: '2026-12-01',
      start_time: null,
      end_date: '2026-12-02',
      end_time: '11:00',
    },
    lines: [
      {
        kind: 'STAY',
        label: 'Hébergement — chambre 101 (VIP), journée',
        billing_unit: 'DAY',
        quantity: 1,
        unit_price_fcfa: 50000,
        amount_fcfa: 50000,
      },
    ],
    totals: {
      gross_fcfa: 50000,
      discount_label: '10 %',
      discount_reason: 'Client fidèle',
      discount_fcfa: 5000,
      net_fcfa: 45000,
    },
    payments: {
      lines: [
        {
          receipt_number: 'REC-2026-000042',
          received_at: '2026-12-01T09:00:00+01:00',
          method: 'Espèces',
          amount_fcfa: 20000,
          refunded_fcfa: 0,
        },
      ],
      paid_fcfa: 20000,
      refunded_fcfa: 0,
      net_paid_fcfa: 20000,
      balance_fcfa: 25000,
    },
    issued_by: { name: 'Grâce' },
    ...overrides,
  }
}

function invoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 'inv-1',
    type: 'INVOICE',
    type_label: 'Facture',
    number: 'FAC-2026-000007',
    issued_at: '2026-12-01T12:00:00+01:00',
    status: 'ISSUED',
    status_label: 'Émise',
    credited_invoice: null,
    gross_fcfa: 50000,
    discount_fcfa: 5000,
    net_fcfa: 45000,
    verification_url: 'http://localhost:8000/verification/factures/inv-1?code=x',
    verification_qr: 'data:image/png;base64,iVBORw0KGgo=',
    snapshot: snapshot(),
    ...overrides,
  }
}

function serve(data: InvoiceDetail) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier() } },
    'GET /api/v1/invoices/inv-1': { body: { data } },
  })
}

describe('Ticket 80 mm d’une facture', () => {
  it('réimprime les lignes, la remise et le solde de l’instantané figé, sans taxe inventée', async () => {
    // Montants de la liste volontairement différents : seul l'instantané fait foi.
    const calls = serve(invoice({ gross_fcfa: 60000, net_fcfa: 60000 }))
    renderApp('/documents/factures/inv-1/ticket')

    const ticket = await screen.findByRole('article', { name: 'Ticket facture FAC-2026-000007' })
    const text = normalize(ticket.textContent)
    expect(text).toContain('Facture')
    expect(text).toContain('N°FAC-2026-000007')
    expect(text).toContain('Date01/12/2026 12:00')
    expect(text).toContain('Émis parGrâce')
    expect(text).toContain('Arrivée01/12/2026')
    expect(text).toContain('Départ02/12/2026 11:00')
    expect(text).toContain('Hébergement — chambre 101 (VIP), journée')
    expect(text).toContain('1 × 50 000 FCFA50 000 FCFA')
    expect(text).toContain('Sous-total50 000 FCFA')
    // Remise de 10 % sur 50 000 : 45 000 (critère du document 06).
    expect(text).toContain('Remise (10 %)− 5 000 FCFA')
    expect(text).toContain('Motif de la remise : Client fidèle')
    expect(text).toContain('Net à payer45 000 FCFA')
    expect(text).toContain('REC-2026-000042 · 01/12/2026')
    expect(text).toContain('Déjà réglé (net)20 000 FCFA')
    expect(text).toContain('Solde à l’émission25 000 FCFA')
    expect(text).toContain('Mode de paiementEspèces')
    expect(text).not.toContain('60 000')
    expect(text).not.toMatch(/tax|TVA/i)
    // D-065 : le ticket est le seul format ; il porte le QR code de vérification publique.
    expect(
      within(ticket).getByRole('img', { name: 'QR code de vérification de la facture' }),
    ).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=')
    expect(text).toContain('http://localhost:8000/verification/factures/inv-1?code=x')
    expect(text).not.toContain('A4')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain('GET /api/v1/invoices/inv-1')
    expect(screen.getByRole('link', { name: 'Ouvrir la réservation' })).toHaveAttribute(
      'href',
      '/reservations/res-1',
    )
  })

  it('signale une facture annulée par avoir', async () => {
    serve(invoice({ status: 'CREDITED', status_label: 'Annulée par avoir' }))
    renderApp('/documents/factures/inv-1/ticket')

    const ticket = await screen.findByRole('article', { name: /Ticket facture/ })
    expect(normalize(ticket.textContent)).toContain('Annulée par avoir')
  })

  it('imprime un avoir avec la facture annulée et son motif, sans versements', async () => {
    serve(
      invoice({
        type: 'CREDIT_NOTE',
        type_label: 'Avoir',
        number: 'AV-2026-000002',
        snapshot: snapshot({
          document: {
            type: 'CREDIT_NOTE',
            label: 'Avoir',
            number: 'AV-2026-000002',
            issued_at: '2026-12-02T09:00:00+01:00',
          },
          credit: {
            credited_invoice_number: 'FAC-2026-000007',
            credited_invoice_issued_at: '2026-12-01T12:00:00+01:00',
            reason: 'Erreur de chambre',
          },
        }),
      }),
    )
    renderApp('/documents/factures/inv-1/ticket')

    const ticket = await screen.findByRole('article', { name: 'Ticket avoir AV-2026-000002' })
    const text = normalize(ticket.textContent)
    expect(text).toContain('Annule la facture n° FAC-2026-000007 du 01/12/2026')
    expect(text).toContain('Motif : Erreur de chambre')
    expect(text).toContain('Montant de l’avoir45 000 FCFA')
    expect(text).toContain('ne constitue pas un remboursement')
    expect(text).not.toContain('Versements à la date')
    expect(text).not.toContain('Reste dû')
  })
})
