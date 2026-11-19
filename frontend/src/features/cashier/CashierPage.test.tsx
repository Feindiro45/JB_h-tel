import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CashJournal, CashMovement } from '../../shared/api/types'
import { addDays, todayIso } from '../../shared/utils/format'
import { admin, cashier, mockApi, renderApp } from '../../test/renderApp'

const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ')
const STAY = {
  id: '0190a000-0000-7000-8000-0000000000aa',
  status: 'CONFIRMED',
  status_label: 'Confirmée',
}
const PARTY = {
  reservation: STAY,
  customer: { id: 'cust-1', full_name: 'NGUEMA Paul' },
  room: { id: 'room-101', number: '101', room_type: 'VIP' },
}

function movement(overrides: Partial<CashMovement>): CashMovement {
  return {
    type: 'PAYMENT',
    type_label: 'Encaissement',
    id: 'pay-1',
    payment_id: 'pay-1',
    receipt_number: 'REC-2026-000001',
    at: '2026-12-01T09:00:00+01:00',
    amount_fcfa: 20000,
    signed_amount_fcfa: 20000,
    counted: true,
    method: 'CASH',
    method_label: 'Espèces',
    agent: { id: 'u1', name: 'Grâce' },
    status: 'VALID',
    status_label: 'Validé',
    reason: null,
    refundable_fcfa: 15000,
    has_refunds: true,
    ...PARTY,
    ...overrides,
  }
}

const JOURNAL: CashJournal = {
  from: todayIso(),
  to: todayIso(),
  totals: {
    collected_fcfa: 50000,
    refunded_fcfa: 5000,
    cancelled_fcfa: 10000,
    payments_count: 2,
    refunds_count: 1,
    net_fcfa: 45000,
  },
  by_method: [
    {
      method: 'MOBILE_MONEY',
      label: 'Mobile money',
      collected_fcfa: 30000,
      refunded_fcfa: 0,
      net_fcfa: 30000,
    },
    {
      method: 'CASH',
      label: 'Espèces',
      collected_fcfa: 20000,
      refunded_fcfa: 5000,
      net_fcfa: 15000,
    },
  ],
  by_agent: [
    { id: 'u1', label: 'Grâce', collected_fcfa: 50000, refunded_fcfa: 0, net_fcfa: 50000 },
    { id: 'u2', label: 'Directeur', collected_fcfa: 0, refunded_fcfa: 5000, net_fcfa: -5000 },
  ],
  movements: [
    movement({}),
    movement({
      id: 'pay-2',
      payment_id: 'pay-2',
      receipt_number: 'REC-2026-000002',
      amount_fcfa: 30000,
      signed_amount_fcfa: 30000,
      method_label: 'Mobile money',
      refundable_fcfa: 30000,
      has_refunds: false,
    }),
    movement({
      id: 'pay-3',
      payment_id: 'pay-3',
      receipt_number: 'REC-2026-000003',
      amount_fcfa: 10000,
      signed_amount_fcfa: 0,
      counted: false,
      status: 'CANCELLED',
      status_label: 'Annulé',
      reason: 'Saisie en double',
      refundable_fcfa: 0,
      has_refunds: false,
    }),
    movement({
      type: 'REFUND',
      type_label: 'Remboursement',
      id: 'ref-1',
      amount_fcfa: 5000,
      signed_amount_fcfa: -5000,
      agent: { id: 'u2', name: 'Directeur' },
      status_label: 'Remboursé',
      reason: 'Geste commercial',
      refundable_fcfa: 0,
      has_refunds: false,
    }),
  ],
}

function serve(user = cashier()) {
  return mockApi({
    'GET /api/v1/auth/me': { body: { data: user } },
    'GET /api/v1/cash-journal': ({ url }) => ({
      body: {
        data: { ...JOURNAL, from: url.searchParams.get('from'), to: url.searchParams.get('to') },
      },
    }),
    'GET /api/v1/receivables': {
      body: {
        data: [
          {
            id: STAY.id,
            customer: 'NGUEMA Paul',
            phone: '+236 70 00 00 00',
            room: { number: '101', type: 'VIP' },
            start_date: todayIso(),
            end_date: todayIso(),
            start_time: null,
            end_time: null,
            status: 'CONFIRMED',
            status_label: 'Confirmée',
            net_fcfa: 100000,
            paid_net_fcfa: 45000,
            balance_fcfa: 55000,
          },
        ],
        total_fcfa: 55000,
      },
    },
    'POST /api/v1/payments/pay-1/refunds': { status: 201, body: { data: { id: 'ref-2' } } },
  })
}

describe('Caisse', () => {
  it('affiche les totaux, les ventilations et les mouvements du serveur', async () => {
    serve()
    renderApp('/caisse')

    const totals = await screen.findByRole('region', { name: 'Totaux de la période' })
    expect(normalize(totals.textContent)).toContain('Net en caisse45 000 FCFA')
    expect(normalize(totals.textContent)).toContain('Annulés10 000 FCFA')

    const agents = screen.getByRole('region', { name: 'Par agent' })
    expect(normalize(within(agents).getByRole('row', { name: /Directeur/ }).textContent)).toContain(
      '− 5 000 FCFA',
    )

    const movements = screen.getByRole('region', { name: 'Mouvements' })
    const refund = within(movements).getByRole('row', { name: /Remboursement/ })
    expect(normalize(refund.textContent)).toContain('− 5 000 FCFA')
    expect(within(movements).getByRole('row', { name: /Saisie en double/ })).toHaveTextContent(
      'Annulé',
    )
    // La caissière n'a ni le remboursement ni l'annulation.
    expect(within(movements).queryByRole('button', { name: /Rembourser/ })).not.toBeInTheDocument()
    expect(within(movements).getByRole('link', { name: 'Reçu REC-2026-000002' })).toHaveAttribute(
      'href',
      '/documents/recus/pay-2',
    )

    const receivables = screen.getByRole('region', { name: 'Soldes à encaisser' })
    expect(normalize(receivables.textContent)).toContain('Total 55 000 FCFA')
  })

  it('change de période avec les raccourcis', async () => {
    const calls = serve()
    renderApp('/caisse')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Hier' }))
    const yesterday = addDays(todayIso(), -1)
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === '/api/v1/cash-journal').at(-1)?.query,
      ).toMatchObject({
        from: yesterday,
        to: yesterday,
      }),
    )
    expect(screen.getByRole('button', { name: 'Hier' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByLabelText('Du')).toHaveValue(yesterday)
  })

  it('l’administrateur rembourse dans la limite du remboursable, avec un motif', async () => {
    const calls = serve(admin())
    renderApp('/caisse')
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: 'Rembourser le reçu REC-2026-000001' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Rembourser' })
    const amount = within(dialog).getByLabelText('Montant remboursé (FCFA)')
    expect(amount).toHaveValue(15000)
    // Pas d'annulation possible sur un versement déjà remboursé en partie.
    expect(
      screen.queryByRole('button', { name: 'Annuler le reçu REC-2026-000001' }),
    ).not.toBeInTheDocument()

    await user.clear(amount)
    await user.type(amount, '20000')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le remboursement' }))
    expect(normalize(within(dialog).getByText(/Au plus/).textContent)).toContain('15 000 FCFA')
    expect(within(dialog).getByText('Le motif est obligatoire.')).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'POST')).toBe(false)

    await user.clear(amount)
    await user.type(amount, '5000')
    await user.type(within(dialog).getByLabelText('Motif du remboursement'), 'Nuit écourtée')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le remboursement' }))
    expect(await screen.findByText(/Remboursement de 5\s000 FCFA enregistré/)).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      amount_fcfa: 5000,
      method: null,
      reason: 'Nuit écourtée',
    })
  })
})
