import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Receipt } from '../../shared/api/types'
import { cashier, mockApi, renderApp } from '../../test/renderApp'

const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 'pay-1',
    receipt_number: 'REC-2026-000042',
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
    hotel: { name: 'JB Hôtel', city: 'Bangui', phone: '+236 70 00 00 00', tax_id: 'NIF-1' },
    ...overrides,
  }
}

function serve(data: Receipt) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: cashier() } },
    'GET /api/v1/payments/pay-1': { body: { data } },
  })
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('Ticket 80 mm d’un reçu', () => {
  it('imprime le versement, la période du séjour et le reste dû sans annoncer « payé »', async () => {
    const calls = serve(receipt())
    renderApp('/documents/recus/pay-1/ticket')

    const ticket = await screen.findByRole('article', { name: 'Ticket du reçu REC-2026-000042' })
    const text = normalize(ticket.textContent)
    expect(text).toContain('JB Hôtel')
    expect(text).toContain('Tél. : +236 70 00 00 00')
    expect(text).toContain('NIF NIF-1')
    expect(text).toContain('Reçu de paiement')
    expect(text).toContain('N°REC-2026-000042')
    expect(text).toContain('Date01/12/2026 09:00')
    expect(text).toContain('Reçu parGrâce')
    expect(text).toContain('ClientNGUEMA Paul')
    expect(text).toContain('Chambre101 (VIP)')
    expect(text).toContain('Arrivée01/12/2026 14:00')
    expect(text).toContain('Départ02/12/2026')
    expect(text).toContain('Durée1 × journée')
    expect(text).toContain('Versement20 000 FCFA')
    expect(text).toContain('Mode de paiementEspèces')
    // Avance de 20 000 sur 50 000 : reste 30 000 (critère du document 06).
    expect(text).toContain('Total du séjour50 000 FCFA')
    expect(text).toContain('Déjà réglé (net)20 000 FCFA')
    expect(text).toContain('Reste dû30 000 FCFA')
    expect(text).toContain('StatutPartiellement payé')
    expect(text).not.toMatch(/\bPayé\b/)
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain('GET /api/v1/payments/pay-1')
  })

  it('ne dit jamais « payé » tant qu’un reste dû subsiste, même si le statut l’affirme', async () => {
    serve(
      receipt({
        summary: { ...receipt().summary, status: 'PAID', status_label: 'Payé' },
      }),
    )
    renderApp('/documents/recus/pay-1/ticket')

    const ticket = await screen.findByRole('article', { name: /Ticket du reçu/ })
    const text = normalize(ticket.textContent)
    expect(text).toContain('StatutSolde restant dû')
    expect(text).not.toMatch(/\bPayé\b/)
  })

  it('marque un encaissement annulé et ses remboursements', async () => {
    serve(
      receipt({
        status: 'CANCELLED',
        status_label: 'Annulé',
        cancelled_at: '2026-12-01T11:00:00+01:00',
        cancellation_reason: 'Saisie en double',
        refunds: [
          {
            id: 'ref-1',
            amount_fcfa: 5000,
            method_label: 'Espèces',
            reason: 'Geste commercial',
            processed_at: '2026-12-01T10:30:00+01:00',
            processed_by: { id: 'u2', name: 'Admin' },
          },
        ],
      }),
    )
    renderApp('/documents/recus/pay-1/ticket')

    const ticket = await screen.findByRole('article', { name: /Ticket du reçu/ })
    const text = normalize(ticket.textContent)
    expect(text).toContain('Annulé')
    expect(text).toContain('Remboursé le 01/12/2026 10:30− 5 000 FCFA')
    const note = within(ticket).getByRole('note')
    expect(normalize(note.textContent)).toContain('motif : Saisie en double')
    expect(normalize(note.textContent)).toContain('plus de valeur de paiement')
  })

  it('réimprime autant de fois que nécessaire sans créer de transaction (imprimante absente)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const calls = serve(receipt())
    renderApp('/documents/recus/pay-1/ticket')
    const user = userEvent.setup()

    await screen.findByRole('article', { name: /Ticket du reçu/ })
    // Imprimante éteinte ou papier épuisé : la caissière relance l’impression plus tard.
    for (let attempt = 0; attempt < 3; attempt++) {
      await user.click(screen.getByRole('button', { name: 'Imprimer le ticket' }))
    }
    expect(print).toHaveBeenCalledTimes(3)
    // Recette 7 (spécification 80 mm) : aucune écriture envoyée au serveur, seulement des lectures.
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([])
    print.mockRestore()
  })

  it('imprime sur une page à la largeur du rouleau, retirée en quittant le ticket', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    serve(receipt())
    const router = renderApp('/documents/recus/pay-1/ticket')
    const user = userEvent.setup()

    await screen.findByRole('article', { name: /Ticket du reçu/ })
    const pageStyle = () => document.getElementById('thermal-ticket-page')
    expect(document.documentElement).toHaveClass('ticket-printing')
    expect(pageStyle()?.textContent).toContain('size: 80mm')

    await user.click(screen.getByRole('button', { name: 'Imprimer le ticket' }))
    expect(print).toHaveBeenCalledTimes(1)

    await user.selectOptions(screen.getByLabelText('Largeur du papier'), '58')
    expect(screen.getByRole('article', { name: /Ticket du reçu/ })).toHaveClass(
      'thermal-ticket--58',
    )
    expect(pageStyle()?.textContent).toContain('size: 58mm')
    expect(localStorage.getItem('jb-hotel.ticket-width')).toBe('58')

    await router.navigate('/documents/recus/pay-1')
    await screen.findByRole('article', { name: 'Reçu REC-2026-000042' })
    await waitFor(() => expect(pageStyle()).toBeNull())
    expect(document.documentElement).not.toHaveClass('ticket-printing')
    print.mockRestore()
  })

  it('propose le ticket depuis le reçu A4', async () => {
    serve(receipt())
    renderApp('/documents/recus/pay-1')

    const link = await screen.findByRole('link', { name: 'Ticket 80 mm' })
    expect(link).toHaveAttribute('href', '/documents/recus/pay-1/ticket')
  })
})
